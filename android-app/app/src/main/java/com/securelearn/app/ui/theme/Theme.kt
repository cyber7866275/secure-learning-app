package com.securelearn.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Solid colors only — no gradients anywhere in the app.
private val Teal700 = Color(0xFF0F766E)
private val Teal800 = Color(0xFF115E59)
private val Slate50 = Color(0xFFF8FAFC)
private val Slate100 = Color(0xFFF1F5F9)
private val Slate800 = Color(0xFF1E293B)
private val Slate900 = Color(0xFF0F172A)
private val Danger = Color(0xFFDC2626)

private val SecureLearnColors = lightColorScheme(
    primary = Teal700,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFCCFBF1),
    onPrimaryContainer = Teal800,
    secondary = Slate800,
    onSecondary = Color.White,
    background = Slate50,
    onBackground = Slate900,
    surface = Color.White,
    onSurface = Slate900,
    surfaceVariant = Slate100,
    onSurfaceVariant = Slate800,
    error = Danger,
    onError = Color.White,
)

private val SecureLearnTypography = Typography(
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 12.sp),
)

@Composable
fun SecureLearnTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = SecureLearnColors,
        typography = SecureLearnTypography,
        content = content,
    )
}
