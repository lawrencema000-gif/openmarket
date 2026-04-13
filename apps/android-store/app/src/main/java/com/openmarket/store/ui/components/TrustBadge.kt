package com.openmarket.store.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.openmarket.store.ui.theme.*

@Composable
fun TrustBadge(type: String, modifier: Modifier = Modifier) {
    val (label, bgColor) = when (type) {
        "verified" -> "Verified" to OpenMarketGreen
        "experimental" -> "Experimental" to OpenMarketYellow
        "new" -> "New" to OpenMarketBlue
        "security-reviewed" -> "Reviewed" to OpenMarketGreen
        "high-risk" -> "High Risk" to OpenMarketRed
        "ads" -> "Ads" to OpenMarketGray
        else -> type to OpenMarketGray
    }

    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = Color.White,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(bgColor)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}
