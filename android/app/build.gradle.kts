import com.worktime.buildlogic.CertPinning
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
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

fun resolveConfigValue(
    key: String,
    envKey: String,
    required: Boolean,
    default: String = "",
): String {
    val value =
        localProperties.getProperty(key)
            ?: providers.gradleProperty(key).orNull
            ?: providers.environmentVariable(envKey).orNull
            ?: default.takeIf { it.isNotBlank() }
    if (required && value.isNullOrBlank()) {
        error(
            "Missing required build property '$key'. " +
                "Set it in local.properties, as a Gradle property, or as the env var '$envKey'."
        )
    }
    return value.orEmpty()
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
        default = "worktime"
    )
val releaseOidcClientId =
    resolveConfigValue(
        "ANDROID_OIDC_CLIENT_ID",
        "ANDROID_OIDC_CLIENT_ID",
        required = false,
        default = "worktime"
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

android {
    namespace = "com.worktime.android"
    compileSdk = 37

    val keystorePath = localProperties.getProperty("keystorePath") ?: providers.environmentVariable("KEYSTORE_PATH").orNull
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
        applicationId = "com.worktime.android"
        minSdk = 26
        targetSdk = 37
        // versionCode = MAJOR * 1000000 + MINOR * 1000 + PATCH (e.g. v1.2.3 → 1002003)
        versionCode = 1000
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            val redirectScheme = "com.worktime.android.debug"
            buildConfigField("String", "WORKTIME_ENVIRONMENT", quoted("debug"))
            buildConfigField("String", "API_BASE_URL", quoted(debugApiBaseUrl))
            buildConfigField("String", "OIDC_CLIENT_ID", quoted(debugOidcClientId))
            buildConfigField("String", "OIDC_SCOPE", quoted(oidcScope))
            buildConfigField("String", "OIDC_REDIRECT_URI", quoted("$redirectScheme:/oauth2redirect"))
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(""))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(""))
            manifestPlaceholders["appAuthRedirectScheme"] = redirectScheme
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
            buildConfigField("String", "OIDC_REDIRECT_URI", quoted("com.worktime.android:/oauth2redirect"))
            buildConfigField("String", "CERTIFICATE_PIN_HOST", quoted(resolvedReleaseCertificatePinHost))
            buildConfigField("String", "CERTIFICATE_PINS", quoted(releaseCertificatePins))
            manifestPlaceholders["appAuthRedirectScheme"] = "com.worktime.android"
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

    debugImplementation(libs.compose.ui.tooling)

    testImplementation(platform(libs.compose.bom))

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.mockk)
    testImplementation(libs.json)
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
    baseline = file("detekt-baseline.xml")
}

ktlint {
    android.set(true)
}
