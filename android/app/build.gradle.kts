plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

fun quoted(value: String) = "\"$value\""

val devApiBaseUrl = providers.gradleProperty("WORKTIME_ANDROID_DEV_API_BASE_URL").orElse("http://10.0.2.2:8000/")
val prodApiBaseUrl = providers.gradleProperty("WORKTIME_ANDROID_PROD_API_BASE_URL").orElse("https://worktime.tjor.im/")
val devOidcAuthority = providers.gradleProperty("WORKTIME_ANDROID_DEV_OIDC_AUTHORITY").orElse("http://10.0.2.2:9000/application/o/worktime")
val prodOidcAuthority = providers.gradleProperty("WORKTIME_ANDROID_PROD_OIDC_AUTHORITY").orElse("https://auth.tjor.im/application/o/worktime")
val devOidcClientId = providers.gradleProperty("WORKTIME_ANDROID_DEV_OIDC_CLIENT_ID").orElse("worktime")
val prodOidcClientId = providers.gradleProperty("WORKTIME_ANDROID_PROD_OIDC_CLIENT_ID").orElse("worktime")
val oidcScope = providers.gradleProperty("WORKTIME_ANDROID_OIDC_SCOPE").orElse("openid profile email offline_access")

android {
    namespace = "com.worktime.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.worktime.android"
        minSdk = 28
        targetSdk = 35
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
            isMinifyEnabled = false
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
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.navigation:navigation-compose:2.9.8")
    implementation("androidx.compose.ui:ui:1.11.2")
    implementation("androidx.compose.ui:ui-tooling-preview:1.11.2")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.datastore:datastore-preferences:1.1.2")
    implementation("androidx.security:security-crypto:1.1.0")
    implementation("com.google.android.material:material:1.14.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:5.3.2")
    implementation("com.squareup.okhttp3:logging-interceptor:5.3.2")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("net.openid:appauth:0.11.1")

    debugImplementation("androidx.compose.ui:ui-tooling:1.11.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
}
