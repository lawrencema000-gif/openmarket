package com.openmarket.store.ui.screens.appdetail

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.openmarket.store.ui.components.TrustBadge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppDetailScreen(
    viewModel: AppDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    if (uiState.isLoading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    if (uiState.error != null || uiState.app == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Failed to load app details", color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                Button(onClick = viewModel::loadAppDetail) { Text("Retry") }
            }
        }
        return
    }

    val app = uiState.app ?: return
    val listing = app.listing

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Header
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(
                    model = listing?.iconUrl,
                    contentDescription = "${listing?.title} icon",
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(16.dp)),
                    contentScale = ContentScale.Crop,
                )
                Spacer(Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = listing?.title ?: app.packageName,
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    app.developer?.let {
                        Text(
                            text = it.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TrustBadge(type = app.trustTier)
                        if (listing?.isExperimental == true) {
                            TrustBadge(type = "experimental")
                        }
                        if (listing?.containsAds == true) {
                            TrustBadge(type = "ads")
                        }
                    }
                }
            }
        }

        // Install Button
        item {
            val installState = uiState.installState
            val context = LocalContext.current

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = viewModel::install,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = installState is InstallState.Idle ||
                        installState is InstallState.Failed ||
                        installState is InstallState.NeedsPermission ||
                        installState is InstallState.UpdateAvailable,
                ) {
                    when (installState) {
                        is InstallState.Idle -> Text("Install")
                        is InstallState.UpdateAvailable -> Text("Update")
                        is InstallState.NeedsPermission -> Text("Install")
                        is InstallState.Preparing -> Text("Preparing…")
                        is InstallState.Downloading -> {
                            val pct = installState.progress
                            Text(if (pct != null) "Downloading… ${(pct * 100).toInt()}%" else "Downloading…")
                        }
                        is InstallState.Verifying -> Text("Verifying…")
                        is InstallState.Installing -> Text("Installing…")
                        is InstallState.Installed -> Text("Installed")
                        is InstallState.Failed -> Text("Retry Install")
                    }
                }

                when (installState) {
                    is InstallState.Downloading -> {
                        val pct = installState.progress
                        if (pct != null) {
                            LinearProgressIndicator(
                                progress = { pct },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        } else {
                            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                        }
                    }
                    is InstallState.Preparing, is InstallState.Verifying, is InstallState.Installing ->
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    is InstallState.Failed -> Text(
                        text = installState.error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    else -> Unit
                }
            }

            // Android requires the user to allow installs from this store
            // once, in system settings, before any install can start.
            if (installState is InstallState.NeedsPermission) {
                AlertDialog(
                    onDismissRequest = viewModel::loadAppDetail,
                    title = { Text("Allow installs") },
                    text = {
                        Text(
                            "To install apps, Android needs you to allow installs " +
                                "from OpenMarket in system settings. This is a one-time step.",
                        )
                    },
                    confirmButton = {
                        TextButton(onClick = {
                            context.startActivity(viewModel.unknownSourcesIntent())
                        }) { Text("Open settings") }
                    },
                    dismissButton = {
                        TextButton(onClick = viewModel::loadAppDetail) { Text("Not now") }
                    },
                )
            }
        }

        // Description
        listing?.let { l ->
            item {
                Text("About", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(4.dp))
                Text(l.fullDescription, style = MaterialTheme.typography.bodyMedium)
            }

            // Screenshots
            if (!l.screenshots.isNullOrEmpty()) {
                item {
                    Text("Screenshots", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(l.screenshots) { screenshotUrl ->
                            AsyncImage(
                                model = screenshotUrl,
                                contentDescription = "Screenshot",
                                modifier = Modifier
                                    .height(200.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                                contentScale = ContentScale.FillHeight,
                            )
                        }
                    }
                }
            }
        }

        // Latest Release
        if (uiState.releases.isNotEmpty()) {
            item {
                val latest = uiState.releases.first()
                Text("Latest Release", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(4.dp))
                Card {
                    Column(Modifier.padding(12.dp)) {
                        Text("v${latest.versionName} (${latest.versionCode})", style = MaterialTheme.typography.titleMedium)
                        Text("Channel: ${latest.channel}", style = MaterialTheme.typography.bodySmall)
                        latest.releaseNotes?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(it, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }

        // Reviews
        if (uiState.reviews.isNotEmpty()) {
            item {
                Text("Reviews", style = MaterialTheme.typography.titleLarge)
            }
            items(uiState.reviews.take(5)) { review ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            repeat(review.rating) {
                                Icon(
                                    Icons.Default.Star,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                        review.title?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
                        review.body?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
        }
    }
}
