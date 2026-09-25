import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("kotlin-kapt")
    id("com.google.dagger.hilt.android")
}

// Backend base URL: local.properties `api.baseUrl` wins, then env API_BASE_URL,
// then the emulator-loopback default.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val baseUrl: String = (localProps.getProperty("api.baseUrl")
    ?: System.getenv("API_BASE_URL")
    ?: "http://10.0.2.2:3000").trim().trimEnd('/')

// Certificate pins for the API host (Stage 7): comma-separated "sha256/..."
// entries. local.properties `api.certPins` wins, then env API_CERT_PINS,
// then empty (pinning inactive). Pins apply to RELEASE builds only — debug
// builds skip pinning so local HTTP dev servers keep working.
val certPins: String = (localProps.getProperty("api.certPins")
    ?: System.getenv("API_CERT_PINS")
    ?: "").trim()

android {
    namespace = "com.securelearn.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.securelearn.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "BASE_URL", "\"$baseUrl\"")
        buildConfigField("String", "CERT_PINS", "\"$certPins\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            // Keep debuggable builds fast; release enables R8 above.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.material:material-icons-extended")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // DI
    implementation("com.google.dagger:hilt-android:2.52")
    kapt("com.google.dagger:hilt-compiler:2.52")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Secure local storage
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // Video playback (Media3 ExoPlayer + HLS). No DRM client library here:
    // streams are AES-128 HLS served through the authorized manifest endpoint.
    // A future Widevine upgrade attaches a DrmSessionManager to the player
    // (see the hook in VideoPlayerViewModel) — until then this is honest
    // AES-128, not fake "DRM".
    val media3Version = "1.4.1"
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-datasource-okhttp:$media3Version")

    // Analytics upload (Stage 6): WorkManager periodic batch upload of the
    // local analytics queue. No foreground work, no wake locks, no new
    // permissions — just the 15-minute CONNECTED-constrained periodic job.
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    implementation("androidx.hilt:hilt-work:1.2.0")
    kapt("androidx.hilt:hilt-compiler:1.2.0")

    // Device integrity (Stage 7): root detection + Play Integrity tokens.
    // RootBeer is a heuristic self-report (a tampered app can lie); the
    // Play Integrity verdict verified server-side is the hardware-backed
    // counterpart. Neither blocks the user if its own call fails.
    implementation("com.scottyab:rootbeer-lib:0.1.0")
    implementation("com.google.android.play:integrity:1.3.0")
}
