import com.worktime.buildlogic.CertPinning
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt.android)
}

// FCM push-wake (#1205) is an optional deployment feature, same as the backend's VAPID-gated Web
// Push: applying the google-services plugin unconditionally would break every build that doesn't
// provide a real Firebase project's google-services.json (every dev/CI build today), since the
// plugin fails the build outright when that file is missing. Applying it only when the file is
// actually present keeps firebase-messaging usable (compiles fine either way) while degrading to
// a no-op -- FirebaseApp simply never auto-initializes -- everywhere else. See android/README.md.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

fun quoted(value: String) = "\"$value\""

val localProperties =
    Properties().also { props ->
        val localPropertiesFile = rootProject.file("local.properties")
        if (localPropertiesFile.exists()) {
            localPropertiesFile.inputStream().use { props.load(it) }
        }
    }

val requestedTaskNames = gradle.startParameter.taskNames.map { it.substringAfterLast(":").lowercase() }

fun isReleaseArtifactRequested(): Boolean {
    if (requestedTaskNames.isEmpty()) {
        return false
    }

    val nonArtifactKeywords = listOf("test", "lint", "detekt", "ktlint")
    return requestedTaskNames.any { taskName ->
        (taskName.contains("release") && nonArtifactKeywords.none { taskName.contains(it) }) ||
            taskName in listOf("assemble", "build", "bundle")
    }
}

fun resolveConfigValue(key: String, envKey: String, required: Boolean, default: String = ""): String {
    // A blank value counts as missing so a placeholder line in local.properties
    // still falls through to the next source or the default.
    val explicitValue =
        sequenceOf(
            localProperties.getProperty(key),
            providers.gradleProperty(key).orNull,
            providers.environmentVariable(envKey).orNull
        ).firstOrNull { !it.isNullOrBlank() }
    if (required && explicitValue.isNullOrBlank()) {
        error(
            "Missing required build property '$key'. " +
                "Set it in local.properties, as a Gradle property, or as the env var '$envKey'."
        )
    }
    return explicitValue ?: default
}

val releaseArtifactRequested = isReleaseArtifactRequested()
val debugApiBaseUrl =
    resolveConfigValue(
        "ANDROID_DEBUG_API_BASE_URL",
        "ANDROID_DEBUG_API_BASE_URL",
        required = false,
        default = "http://10.0.2.2:8000/"
    )
val releaseApiBaseUrl =
    resolveConfigValue(
        "ANDROID_API_BASE_URL",
        "ANDROID_API_BASE_URL",
        required = releaseArtifactRequested,
        default = if (releaseArtifactRequested) "" else "https://release.placeholder.invalid/"
    )
val debugOidcClientId =
    resolveConfigValue(
        "ANDROID_DEBUG_OIDC_CLIENT_ID",
        "ANDROID_DEBUG_OIDC_CLIENT_ID",
        required = false,
        default = "worktime-android"
    )
val releaseOidcClientId =
    resolveConfigValue(
        "ANDROID_OIDC_CLIENT_ID",
        "ANDROID_OIDC_CLIENT_ID",
        required = false,
        default = "worktime-android"
    )
val oidcScope =
    resolveConfigValue(
        "ANDROID_OIDC_SCOPE",
        "ANDROID_OIDC_SCOPE",
        required = false,
        default = "openid profile email offline_access"
    )
val releaseCertificatePinHosts =
    resolveConfigValue(
        "ANDROID_CERTIFICATE_PIN_HOST",
        "ANDROID_CERTIFICATE_PIN_HOST",
        required = releaseArtifactRequested
    )
val releaseCertificatePins =
    resolveConfigValue(
        "ANDROID_CERTIFICATE_PINS",
        "ANDROID_CERTIFICATE_PINS",
        required = releaseArtifactRequested
    )

val resolvedReleaseCertificatePinHost = releaseCertificatePinHosts.trim()
val resolvedReleaseCertificatePins = CertPinning.splitCsv(releaseCertificatePins)
if (releaseArtifactRequested) {
    CertPinning.requireValidPinFormats(resolvedReleaseCertificatePins)
    CertPinning.requireHostConfiguredForPins(resolvedReleaseCertificatePinHost, resolvedReleaseCertificatePins)
}

// Single source of truth for the app version: the repo-root VERSION file
// (CalVer YYYY.MM.MICRO), kept in lockstep with frontend/package.json and
// backend/pyproject.toml (see frontend/scripts/check-version-consistency.ts
// and backend/pyproject.toml's [tool.hatch.version]) instead of a
// hand-maintained literal here. Read via providers.fileContents (not
// File.readText()) so the file is tracked as a build configuration input and
// this stays Configuration Cache-compatible.
val appVersion =
    providers
        .fileContents(layout.projectDirectory.file("../../VERSION"))
        .asText
        .map { it.trim() }
        .get()

fun versionCodeFor(version: String): Int {
    // CalVer YYYY.MM.MICRO: year/month/monthly-counter map onto the same
    // MAJOR.MINOR.PATCH slots the versionCode formula below was built for.
    val parts = version.substringBefore("-").substringBefore("+").split(".")
    check(parts.size == 3) { "Expected a YYYY.MM.MICRO version, got \"$version\"" }
    val (major, minor, patch) =
        parts.map {
            it.toIntOrNull() ?: error("Invalid integer component \"$it\" in version \"$version\"")
        }
    // minor/patch must each fit in 3 digits or they'd overflow into the next digit
    // group and collide with a different version's computed code.
    check(major >= 0) { "Year must be non-negative, got $major" }
    check(minor in 0..999) { "Month must be between 0 and 999 to avoid versionCode collision, got $minor" }
    check(patch in 0..999) { "Monthly counter must be between 0 and 999 to avoid versionCode collision, got $patch" }
    val versionCode = major * 1_000_000 + minor * 1_000 + patch
    check(versionCode <= 2_100_000_000) {
        // With major = calendar year, this caps the scheme at year 2099.
        "versionCode $versionCode exceeds Google Play maximum of 2100000000"
    }
    return versionCode
}

// Falls back to "unknown" rather than failing the build when git is unavailable
// (e.g. building from a downloaded source archive with no .git directory).
val gitCommit =
    try {
        providers
            .exec {
                commandLine("git", "rev-parse", "--short", "HEAD")
                isIgnoreExitValue = true
            }.standardOutput
            .asText
            .get()
            .trim()
            .ifEmpty { "unknown" }
    } catch (e: Exception) {
        "unknown"
    }

android {
    namespace = "com.worktime.android"
    compileSdk = 37

    val keystorePath =
        localProperties.getProperty("keystorePath") ?: providers.environmentVariable("KEYSTORE_PATH").orNull
    val keystorePassword =
        localProperties.getProperty("keystorePassword")
            ?: providers.environmentVariable("STORE_PASSWORD").orNull
    val keystoreKeyAlias = localProperties.getProperty("keyAlias") ?: providers.environmentVariable("KEY_ALIAS").orNull
    val keystoreKeyPassword =
        localProperties.getProperty("keyPassword") ?: providers.environmentVariable("KEY_PASSWORD").orNull
    signingConfigs {
        if (!keystorePath.isNullOrBlank() &&
            !keystorePassword.isNullOrBlank() &&
            !keystoreKeyAlias.isNullOrBlank() &&
            !keystoreKeyPassword.isNullOrBlank()
        ) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                keyAlias = keystoreKeyAlias
                keyPassword = keystoreKeyPassword
            }
        }
    }

    defaultConfig {
        applicationId = "im.tjor.worktime"
        minSdk = 30
        targetSdk = 37
        // versionCode = MAJOR * 1000000 + MINOR * 1000 + PATCH (e.g. v1.2.3 → 1002003)
        versionCode = versionCodeFor(appVersion)
        versionName = appVersion
        buildConfigField("String", "BUILD_COMMIT", quoted(gitCommit))
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "WORKTIME_ENVIRONMENT", quoted("debug"))
            buildConfigField("String", "API_BASE_URL", quoted(debugApiBaseUrl))
            buildConfigField("String", "OIDC_CLIENT_ID", quoted(debugOidcClientId))
            buildConfigField("String", "OIDC_SCOPE", quoted(oidcScope))
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(""))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(""))
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            val releaseSigningConfig = signingConfigs.findByName("release")
            if (releaseSigningConfig != null) {
                signingConfig = releaseSigningConfig
            } else if (releaseArtifactRequested) {
                error(
                    "Release build requested but signing credentials are not set " +
                        "(KEYSTORE_PATH, KEY_ALIAS, KEY_PASSWORD, STORE_PASSWORD)."
                )
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "WORKTIME_ENVIRONMENT", quoted("prod"))
            buildConfigField("String", "API_BASE_URL", quoted(releaseApiBaseUrl))
            buildConfigField("String", "OIDC_CLIENT_ID", quoted(releaseOidcClientId))
            buildConfigField("String", "OIDC_SCOPE", quoted(oidcScope))
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(resolvedReleaseCertificatePinHost))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(releaseCertificatePins))
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            // OkHttp 5.x and jspecify both ship this OSGI metadata file
            excludes += "META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.androidx.navigation.compose)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.biometric)
    implementation(libs.material)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.retrofit)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.retrofit.kotlinx.serialization.converter)
    implementation(libs.appauth)
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.androidx.work.runtime.ktx)

    debugImplementation(libs.compose.ui.tooling)

    testImplementation(platform(libs.compose.bom))

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.mockk)
    testImplementation(libs.json)
    testImplementation(libs.androidx.work.testing)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.espresso.core)
    androidTestImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
    baseline = file("detekt-baseline.xml")
}

ktlint {
    android.set(true)
}
