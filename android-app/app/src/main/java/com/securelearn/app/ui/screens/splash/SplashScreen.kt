package com.securelearn.app.ui.screens.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun SplashScreen(
    viewModel: SplashViewModel = hiltViewModel(),
    onLoggedIn: () -> Unit,
    onLoggedOut: (notice: String?) -> Unit,
) {
    val decision by viewModel.decision.collectAsState()

    LaunchedEffect(decision) {
        when (val d = decision) {
            SplashDecision.GoMain -> onLoggedIn()
            SplashDecision.GoLogin -> onLoggedOut(null)
            is SplashDecision.GoLoginBlocked -> onLoggedOut(d.message)
            SplashDecision.Loading -> Unit
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A)),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "SecureLearn",
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Secure learning, simplified",
                color = Color(0xFF94A3B8),
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(32.dp))
            CircularProgressIndicator(color = Color(0xFF2DD4BF))
        }
    }
}
