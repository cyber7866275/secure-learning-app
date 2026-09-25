package com.securelearn.app.ui.screens.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.securelearn.app.ui.components.EmptyScreen
import com.securelearn.app.ui.components.ErrorScreen
import com.securelearn.app.ui.components.LoadingScreen
import com.securelearn.app.ui.screens.home.PdfRow

@Composable
fun LibraryScreen(
    viewModel: LibraryViewModel = hiltViewModel(),
    onOpenPdf: (String, String) -> Unit,
) {
    val ui by viewModel.ui.collectAsState()
    val categories by viewModel.categories.collectAsState()
    var query by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("Library", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it
                    viewModel.onSearchChanged(it)
                },
                label = { Text("Search PDFs") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (categories.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterChip(
                            selected = viewModel.categoryId == null,
                            onClick = { viewModel.onCategorySelected(null) },
                            label = { Text("All") },
                        )
                    }
                    items(categories) { cat ->
                        FilterChip(
                            selected = viewModel.categoryId == cat.id,
                            onClick = {
                                viewModel.onCategorySelected(
                                    if (viewModel.categoryId == cat.id) null else cat.id,
                                )
                            },
                            label = { Text("${cat.name} (${cat.itemCount})") },
                        )
                    }
                }
            }
        }

        when {
            ui.loading -> LoadingScreen("Loading library…")
            ui.error != null -> ErrorScreen(ui.error!!, onRetry = viewModel::refresh)
            ui.items.isEmpty() -> EmptyScreen("No PDFs found. Try a different search.")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                itemsIndexed(ui.items) { index, pdf ->
                    if (index >= ui.items.size - 3) viewModel.loadMore()
                    PdfRow(pdf = pdf, onClick = { onOpenPdf(pdf.id, pdf.title) })
                }
                if (ui.loadingMore) {
                    item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                }
            }
        }
    }
}
