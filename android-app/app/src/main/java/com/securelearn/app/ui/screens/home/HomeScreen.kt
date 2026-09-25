package com.securelearn.app.ui.screens.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.securelearn.app.data.remote.dto.PdfItem
import com.securelearn.app.ui.components.EmptyScreen
import com.securelearn.app.ui.components.ErrorScreen
import com.securelearn.app.ui.components.LoadingScreen

@Composable
fun HomeScreen(
    viewModel: HomeViewModel = hiltViewModel(),
    onOpenPdf: (String, String) -> Unit,
) {
    val ui by viewModel.ui.collectAsState()

    when {
        ui.loading -> LoadingScreen("Loading home…")
        ui.error != null -> ErrorScreen(ui.error!!, onRetry = viewModel::load)
        else -> HomeContent(ui = ui, onOpenPdf = onOpenPdf)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HomeContent(ui: HomeUiState, onOpenPdf: (String, String) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            Column {
                Text(
                    "Hello, ${ui.userName.ifBlank { "Learner" }} 👋",
                    style = MaterialTheme.typography.headlineSmall,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "Your secure library is ready",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (ui.banners.isNotEmpty()) {
            item {
                val pagerState = rememberPagerState(pageCount = { ui.banners.size })
                HorizontalPager(state = pagerState, modifier = Modifier.fillMaxWidth()) { page ->
                    val banner = ui.banners[page]
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                        ),
                    ) {
                        Column(Modifier.padding(20.dp)) {
                            Text(
                                banner.title,
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                            if (!banner.body.isNullOrBlank()) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    banner.body!!,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f),
                                )
                            }
                        }
                    }
                }
            }
        }

        if (ui.categories.isNotEmpty()) {
            item {
                Text("Categories", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(ui.categories) { cat ->
                        AssistChip(
                            onClick = { /* deep-link into Library filter — Stage 4 keeps it simple */ },
                            label = { Text("${cat.name} (${cat.itemCount})") },
                        )
                    }
                }
            }
        }

        item {
            Text("Recently added", style = MaterialTheme.typography.titleMedium)
        }
        if (ui.recentPdfs.isEmpty()) {
            item { EmptyScreen("No PDFs available yet.") }
        } else {
            items(ui.recentPdfs) { pdf ->
                PdfRow(pdf = pdf, onClick = { onOpenPdf(pdf.id, pdf.title) })
            }
        }
    }
}

@Composable
fun PdfRow(pdf: PdfItem, onClick: () -> Unit) {
    val breadcrumb = listOfNotNull(
        pdf.category?.name,
        pdf.subject?.name,
        pdf.chapter?.name,
    ).joinToString(" › ")
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .padding(10.dp),
            ) {
                Icon(
                    Icons.Filled.PictureAsPdf,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(
                    pdf.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                )
                if (breadcrumb.isNotBlank()) {
                    Text(
                        breadcrumb,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                pdf.pageCount?.let {
                    Text(
                        "$it pages",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
