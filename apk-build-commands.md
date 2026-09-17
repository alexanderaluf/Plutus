# 1. Navigate to the android folder on drive P:

cd P:\budget-tracker\android

# 2. Set Java 17

$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"; .\gradlew.bat assembleRelease

# 3. Assemble the release APK

.\gradlew.bat assembleRelease
