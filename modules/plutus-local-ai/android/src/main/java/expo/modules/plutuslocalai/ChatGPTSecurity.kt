package expo.modules.plutuslocalai

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.math.BigInteger
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.KeyFactory
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.RSAPublicKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The page shown after sign-in. `url` is the app's own deep link (for example
 * `plutus://chatgpt-callback`); the page opens it so the browser hands control back.
 */
internal data class ReturnPage(val url: String, val title: String, val message: String, val action: String) {
  /** An intent URL pinned to this package, so another app cannot claim the hand-off. */
  private fun intentUrl(packageName: String): String? {
    val scheme = url.substringBefore("://", "")
    val rest = url.substringAfter("://", "")
    if (!Regex("[a-z][a-z0-9+.-]*").matches(scheme) || scheme == "http" || scheme == "https") return null
    if (!Regex("[A-Za-z0-9/_.-]*").matches(rest)) return null
    return "intent://$rest#Intent;scheme=$scheme;package=$packageName;end"
  }

  fun html(packageName: String): String {
    val link = intentUrl(packageName)?.let(::escape)
    val refresh = link?.let { "<meta http-equiv=\"refresh\" content=\"0;url=$it\">" } ?: ""
    val button = link?.let { "<a href=\"$it\">${escape(action.ifBlank { "Open Plutus" })}</a>" } ?: ""
    return "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">$refresh" +
      "<title>Plutus</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:40px 24px;color:#17201b;background:#dce7e0}" +
      "a{display:inline-block;margin-top:12px;padding:14px 24px;border-radius:16px;background:#17201b;color:#fff;text-decoration:none;font-weight:600}" +
      "@media(prefers-color-scheme:dark){body{color:#e8efea;background:#101512}a{background:#e8efea;color:#101512}}</style></head>" +
      "<body><h2>${escape(title.ifBlank { "Return to Plutus" })}</h2><p>${escape(message)}</p>$button</body></html>"
  }

  private fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
}

/** Credentials never enter the financial document, Android backup, or logs. */
internal class ChatGPTSecurity(private val context: Context) {
  @Volatile private var listener: ServerSocket? = null
  private var expectedState = ""
  private var returnPage = ReturnPage("", "", "", "")
  private val file get() = AtomicFile(File(context.noBackupFilesDir, "chatgpt-session-v1"))
  private val alias = "plutus-chatgpt-v1"

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }

  @Synchronized fun read(): String? {
    if (!file.baseFile.exists()) return null
    val bytes = file.readFully()
    require(bytes.size > 28) { "CHATGPT_STORAGE_INVALID" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
  }

  @Synchronized fun write(value: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val bytes = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    val output = file.startWrite()
    try { output.write(bytes); file.finishWrite(output) }
    catch (error: Exception) { file.failWrite(output); throw error }
  }

  fun random(): String = encode(ByteArray(32).also { SecureRandom().nextBytes(it) })
  fun digest(value: String): String = encode(MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.US_ASCII)))

  @Synchronized fun start(state: String, page: ReturnPage): String {
    require(listener == null) { "CHATGPT_SIGNIN_BUSY" }
    val socket = ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"))
    socket.soTimeout = 300_000
    expectedState = state
    returnPage = page
    listener = socket
    return "http://127.0.0.1:${socket.localPort}/auth/callback"
  }

  fun waitForCallback(): String {
    val server = listener ?: error("CHATGPT_SIGNIN_CANCELLED")
    val deadline = System.currentTimeMillis() + 300_000
    try {
      while (System.currentTimeMillis() < deadline && !server.isClosed) {
        val socket = server.accept()
        // A browser may open idle or unrelated connections; only a valid callback ends the wait.
        val target = try { socket.use { respond(it) } } catch (_: IOException) { null }
        if (target != null) return "http://127.0.0.1:${server.localPort}$target"
      }
      error("CHATGPT_SIGNIN_TIMEOUT")
    } finally {
      server.close()
      synchronized(this) { if (listener === server) listener = null }
    }
  }

  /** Returns the request target of a valid callback, after answering the browser. */
  private fun respond(socket: Socket): String? {
    socket.soTimeout = 3_000
    val input = socket.getInputStream()
    val request = StringBuilder()
    // Read the whole header block: closing with unread input can reset the connection.
    while (request.length < 16_384 && !request.endsWith("\r\n\r\n") && !request.endsWith("\n\n")) {
      val char = input.read()
      if (char < 0) break
      request.append(char.toChar())
    }
    val line = request.lineSequence().first()
    val target = line.split(" ").getOrNull(1) ?: ""
    val uri = Uri.parse("http://127.0.0.1$target")
    val valid = line.startsWith("GET ") && uri.path == "/auth/callback" &&
      MessageDigest.isEqual((uri.getQueryParameter("state") ?: "").toByteArray(), expectedState.toByteArray())
    val body = if (valid) returnPage.html(context.packageName) else "Invalid callback"
    val response = "HTTP/1.1 ${if (valid) "200 OK" else "400 Bad Request"}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nConnection: close\r\nContent-Length: ${body.toByteArray().size}\r\n\r\n$body"
    socket.getOutputStream().apply { write(response.toByteArray()); flush() }
    return if (valid) target else null
  }

  @Synchronized fun cancel() { listener?.close(); listener = null }

  fun verify(token: String, jwks: String, clientId: String, nonce: String): Map<String, String> {
    val parts = token.split('.')
    require(parts.size == 3) { "CHATGPT_IDENTITY_INVALID" }
    val header = JSONObject(String(decode(parts[0]), Charsets.UTF_8))
    require(header.getString("alg") == "RS256") { "CHATGPT_IDENTITY_INVALID" }
    val keys = JSONObject(jwks).getJSONArray("keys")
    val jwk = (0 until keys.length()).map { keys.getJSONObject(it) }
      .firstOrNull { it.optString("kid") == header.getString("kid") && it.optString("kty") == "RSA" }
      ?: error("CHATGPT_IDENTITY_INVALID")
    val publicKey = KeyFactory.getInstance("RSA").generatePublic(RSAPublicKeySpec(
      BigInteger(1, decode(jwk.getString("n"))), BigInteger(1, decode(jwk.getString("e")))))
    val signature = Signature.getInstance("SHA256withRSA").apply {
      initVerify(publicKey); update("${parts[0]}.${parts[1]}".toByteArray(Charsets.US_ASCII))
    }
    require(signature.verify(decode(parts[2]))) { "CHATGPT_IDENTITY_INVALID" }
    val claims = JSONObject(String(decode(parts[1]), Charsets.UTF_8))
    val aud = claims.get("aud")
    val audiences = if (aud is org.json.JSONArray) (0 until aud.length()).map { aud.getString(it) } else listOf(aud.toString())
    require(claims.getString("iss") == "https://auth.openai.com" && clientId in audiences &&
      (audiences.size == 1 || claims.optString("azp") == clientId) &&
      claims.getLong("exp") > System.currentTimeMillis() / 1000 && claims.getString("nonce") == nonce &&
      claims.getString("sub").isNotBlank()) { "CHATGPT_IDENTITY_INVALID" }
    return mapOf("subject" to claims.getString("sub"), "email" to claims.optString("email"))
  }

  private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  private fun decode(value: String) = Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}
