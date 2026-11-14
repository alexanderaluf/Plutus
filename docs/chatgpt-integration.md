# Optional ChatGPT plan usage

Settings → AI manages ChatGPT connections and the app's E2B/E4B model files.
The empty chat and model selection sheet also offer **Continue with ChatGPT**.
ChatGPT cards and sign-in buttons use the actual monochrome ChatGPT mark,
bundled as a local SVG component. The vector source is Lobe Icons; its MIT
notice is included in `docs/licenses/lobe-icons.txt`. OpenAI owns the mark.
Only models downloaded into Plutus are manageable; mobile app sandboxes do not
allow Plutus to enumerate or delete other apps' private model files.

The explicitly requested ChatGPT feature is an exception to the repository's
offline-only networking rule. Financial records remain canonical in SQLite, and
local models continue to work offline. ChatGPT requests send the current prompt,
recent conversation and selected financial tool results directly to OpenAI after
an in-app disclosure and OpenAI's browser consent. There is no application server,
remote database, analytics, automatic cloud fallback, Drive integration or API key.

## Authentication and credentials

Implementation follows OpenAI's public open-source Sign in with ChatGPT contract:

- <https://developers.openai.com/siwc/token-sharing-open-source/sign-in>
- <https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions>
- <https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference>
- <https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations>

The system browser authorizes a dynamically registered public client. A native
listener binds only `127.0.0.1`, with a random port, five-minute timeout, bounded
request size and matching state. Every attempt has fresh PKCE S256, state and
OIDC nonce. ID tokens require an RS256 signature verified against OpenAI's fixed
JWKS URL, issuer, issued-client audience, expiry, nonce and subject checks. A
returning registration cannot silently change its client ID or subject. Browser
cancellation and declined plan permission do not enable inference.

Reauthorization reuses the issued client ID with the documented `id_token_hint`
and `login_hint`; it sends no `prompt`. The listener ignores idle or malformed
browser connections and reads the full request before answering. After a valid
callback, the loopback page opens the app's own deep link
(`plutus://chatgpt-callback`; on Android an `intent://` URL pinned to the
installed package), with a localized button as a fallback when the browser
blocks the automatic hand-off. `src/app/+native-intent.tsx` swallows that link,
so the sign-in finishes on the screen that started it.

Failures keep OpenAI's code: OAuth callback errors become `signin:<error>`,
HTTP errors keep the OAuth/Responses code or become `http_<status>`, and the UI
shows the code instead of a generic connectivity message. Each failure logs one
`[ChatGPT] <step> failed: <code> status=… request=…` line (visible in `adb
logcat` as `ReactNativeJS`) without tokens, codes from the callback, or
account data.

Credentials and per-installation host identity are separate from financial data:
Android uses an AES-GCM vault encrypted by Android Keystore in `noBackupFilesDir`;
iOS uses a device-only Keychain item. They never enter `BackupDocument` or its
exports. Credential writes are atomic and serialized; refreshes are serialized
for rotating refresh tokens. Unsupported/corrupt credential layouts surface an
error rather than being overwritten. No financial schema migration is needed.

Disconnect attempts refresh-token revocation at the endpoint published by
OpenAI's OIDC discovery document, then removes local tokens. If remote revocation
cannot be confirmed, the UI explicitly tells the user to disconnect in ChatGPT
settings. The opaque host ID and issued client/identity mapping remain so a
later sign-in can reuse the registration. Disconnect does not cancel a paid plan.

## Chat history

ChatGPT chats are saved in the canonical document (`aiChats`, schema 23) from the
first message and are listed in the chat history side sheet, where they can be
opened, pinned, renamed and deleted. Each request includes the chat's earlier
questions and answers (up to the last 40 messages, 32,000 characters) as
context; reopening a saved chat restores that context. On-device chats keep
their short six-message window and are never saved or sent to ChatGPT. Saved
chats are part of JSON/ZIP backups and are deleted with their profile.

## Inference and privacy

Model discovery uses the selected account's `/v1/models` catalog, preserving its
display order. The adapter implements the existing `ChatModel` contract, so local
tools, financial selectors and explicit change-proposal confirmation still apply.
Switching provider, ChatGPT account, model or local profile remounts transient
chat state; previous offline transcripts are never replayed to ChatGPT.

Requests use `POST https://api.openai.com/v1/responses`, `store: false`,
`stream: true`, `instructions` and explicit history. The adapter omits unsupported
preview fields and requires a nonempty answer and `response.completed` before
reporting success. Errors stop inference without a billing fallback. Plan-limit
errors link to <https://chatgpt.com/settings/usage>. Selecting a local model
explicitly switches back to offline inference.

Voice transcription stays local. The microphone is unavailable while ChatGPT is
selected because subscription inference does not support audio/transcription.
Requests are cancelled when the chat backgrounds or unmounts.

## Verification

`node --test tests/chatgpt.test.cjs` covers callback validation, permission gating,
model discovery, streamed completion, issued-client reuse, credential rotation,
temporary failures, corrupt storage, usage limits and offline disconnection.
These tests use fake OAuth credentials; completing browser authorization and a
real subscription request requires an eligible user's account. iOS native code
also requires a macOS/Xcode build for platform verification.

For a local Android APK, use the existing generated Android project and Gradle:

```powershell
cd android
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
```

Keep the existing application ID and signing key. Never uninstall or clear data
to work around an update failure. Generated native projects must match the
installed SDK: SDK 58's template uses Gradle 9.4.1, opts out of AGP 9 built-in
Kotlin/new DSL for existing native libraries, and uses
`proguard-android-optimize.txt`. Gradle bundles the app's existing Expo runtime;
the APK runs independently of Expo Go, Metro and EAS.

The connected phone's existing version 5 was installed through Google Play and
uses Play App Signing. Android rejects an update signed with the local debug
key. The locally installed verification build is therefore **Plutus AI Test**
(`com.plutus.budgettracker.aitest`, version 6), with a separate data sandbox and
`plutus-ai-test` URL scheme. The production application ID remains unchanged.
Both APKs are in `.artifacts/`; only the test variant was installed. The original
Play installation and its records were preserved. Updating the Play installation
in place requires a release signed through its existing Play signing process.
