plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

fun quoted(value: String) = "\"$value\""

val devApiBaseUrl = providers.gradleProperty("WORKTIME_ANDROID_DEV_API_BASE_URL").orElse("http://10.0.2.2:8000/")
val prodApiBaseUrl = providers.gradleProperty("WORKTIME_ANDROID_PROD_API_BASE_URL").orElse("https://worktime.tjor.im/")
val devOidcAuthority = providers.gradleProperty("WORKTIME_ANDROID_DEV_OIDC_AUTHORITY").orElse("http://10.0.2.2:8080/realms/worktime")
val prodOidcAuthority = providers.gradleProperty("WORKTIME_ANDROID_PROD_OIDC_AUTHORITY").orElse("https://auth.tjor.im/realms/worktime")
val devOidcClientId = providers.gradleProperty("WORKTIME_ANDROID_DEV_OIDC_CLIENT_ID").orElse("worktime")
val prodOidcClientId = providers.gradleProperty("WORKTIME_ANDROID_PROD_OIDC_CLIENT_ID").orElse("worktime")
val oidcScope = providers.gradleProperty("WORKTIME_ANDROID_OIDC_SCOPE").orElse("openid profile email offline_access")

android {
    namespace = "com.worktime.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.worktime.android"
        minSdk = 28
        targetSdk = 37
        // versionCode = MAJOR * 1000000 + MINOR * 1000 + PATCH (e.g. v1.2.3 → 1002003)
        versionCode = 1000
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "environment"

    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            val redirectScheme = "com.worktime.android.dev"
            buildConfigField("String", "WORKTIME_ENVIRONMENT", quoted("dev"))
            buildConfigField("String", "API_BASE_URL", quoted(devApiBaseUrl.get()))
            buildConfigField("String", "OIDC_AUTHORITY", quoted(devOidcAuthority.get()))
            buildConfigField("String", "OIDC_CLIENT_ID", quoted(devOidcClientId.get()))
            buildConfigField("String", "OIDC_SCOPE", quoted(oidcScope.get()))
            buildConfigField("String", "OIDC_REDIRECT_URI", quoted("$redirectScheme:/oauth2redirect"))
            manifestPlaceholders["appAuthRedirectScheme"] = redirectScheme
        }
        create("prod") {
            dimension = "environment"
            buildConfigField("String", "WORKTIME_ENVIRONMENT", quoted("prod"))
            buildConfigField("String", "API_BASE_URL", quoted(prodApiBaseUrl.get()))
            buildConfigField("String", "OIDC_AUTHORITY", quoted(prodOidcAuthority.get()))
            buildConfigField("String", "OIDC_CLIENT_ID", quoted(prodOidcClientId.get()))
            buildConfigField("String", "OIDC_SCOPE", quoted(oidcScope.get()))
            buildConfigField("String", "OIDC_REDIRECT_URI", quoted("com.worktime.android:/oauth2redirect"))
            manifestPlaceholders["appAuthRedirectScheme"] = "com.worktime.android"
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
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
    implementation(libs.androidx.navigation.compose)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)
    implementation(libs.material)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.retrofit)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.retrofit.kotlinx.serialization.converter)
    implementation(libs.appauth)

    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
