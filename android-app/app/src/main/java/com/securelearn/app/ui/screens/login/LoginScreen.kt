package com.securelearn.app.ui.screens.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun LoginScreen(
    viewModel: LoginViewModel = hiltViewModel(),
    notice: String? = null,
    onLoggedIn: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    var tab by remember { mutableIntStateOf(0) } // 0 = Phone/OTP, 1 = Email

    LaunchedEffect(state) {
        if (state is LoginUiState.Success) onLoggedIn()
    }
    // Out-of-band notice (e.g. session revoked by the Splash root-block).
    LaunchedEffect(notice) {
        if (!notice.isNullOrBlank()) viewModel.showNotice(notice)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Welcome back", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Log in to access your secure library",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))

        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Phone (OTP)") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Email") })
        }
        Spacer(Modifier.height(24.dp))

        when (tab) {
            0 -> OtpTab(state = state, viewModel = viewModel)
            1 -> EmailTab(state = state, viewModel = viewModel)
        }

        val error = (state as? LoginUiState.Error)?.message
        if (error != null) {
            Spacer(Modifier.height(12.dp))
            Text(error, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun OtpTab(state: LoginUiState, viewModel: LoginViewModel) {
    var phone by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    val resendSeconds by viewModel.resendSeconds.collectAsState()
    val otpStage by viewModel.otpStage.collectAsState()
    val loading = state is LoginUiState.Loading

    if (otpStage) {
        OtpEntry(
            otp = otp,
            onOtpChange = { if (it.length <= 6 && it.all(Char::isDigit)) otp = it },
            loading = loading,
            onVerify = { viewModel.verifyOtp(otp, name.ifBlank { null }) },
            resendSeconds = resendSeconds,
            onResend = { viewModel.requestOtp(phone) },
            onChangeNumber = {
                otp = ""
                viewModel.backToPhoneEntry()
            },
        )
    } else {
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("Mobile number") },
            placeholder = { Text("9876543210") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Your name (for new accounts)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = { viewModel.requestOtp(phone) },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (loading) CircularProgressIndicator(
                modifier = Modifier.padding(end = 8.dp),
                strokeWidth = 2.dp,
            )
            Text("Send OTP")
        }
    }
}

@Composable
private fun OtpEntry(
    otp: String,
    onOtpChange: (String) -> Unit,
    loading: Boolean,
    onVerify: () -> Unit,
    resendSeconds: Int,
    onResend: () -> Unit,
    onChangeNumber: () -> Unit,
) {
    OutlinedTextField(
        value = otp,
        onValueChange = onOtpChange,
        label = { Text("6-digit OTP") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(16.dp))
    Button(onClick = onVerify, enabled = !loading, modifier = Modifier.fillMaxWidth()) {
        if (loading) CircularProgressIndicator(
            modifier = Modifier.padding(end = 8.dp),
            strokeWidth = 2.dp,
        )
        Text("Verify & Log in")
    }
    Spacer(Modifier.height(8.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextButton(onClick = onChangeNumber) { Text("Change number") }
        if (resendSeconds > 0) {
            Text("Resend in ${resendSeconds}s", style = MaterialTheme.typography.labelSmall)
        } else {
            TextButton(onClick = onResend) { Text("Resend OTP") }
        }
    }
}

@Composable
private fun EmailTab(state: LoginUiState, viewModel: LoginViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val loading = state is LoginUiState.Loading

    OutlinedTextField(
        value = email,
        onValueChange = { email = it },
        label = { Text("Email") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text("Password") },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(16.dp))
    Button(
        onClick = { viewModel.loginEmail(email, password) },
        enabled = !loading,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (loading) CircularProgressIndicator(
            modifier = Modifier.padding(end = 8.dp),
            strokeWidth = 2.dp,
        )
        Text("Log in")
    }
}
