package com.securelearn.app.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryBooks
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.ui.screens.home.HomeScreen
import com.securelearn.app.ui.screens.library.LibraryScreen
import com.securelearn.app.ui.screens.login.LoginScreen
import com.securelearn.app.ui.screens.profile.ProfileScreen
import com.securelearn.app.ui.screens.splash.SplashScreen
import com.securelearn.app.ui.screens.player.VideoPlayerScreen
import com.securelearn.app.ui.screens.videos.VideosScreen
import com.securelearn.app.ui.screens.viewer.PdfViewerScreen

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab(Tabs.HOME, "Home", Icons.Filled.Home),
    Tab(Tabs.LIBRARY, "Library", Icons.Filled.LibraryBooks),
    Tab(Tabs.VIDEOS, "Videos", Icons.Filled.PlayCircle),
    Tab(Tabs.PROFILE, "Profile", Icons.Filled.Person),
)

/**
 * Root navigation. Watches the session: when the token refresh fails (or the
 * user logs out / is remotely logged out), [SessionManager.isLoggedIn] flips
 * to false and we pop everything back to Login.
 */
@Composable
fun AppNavHost(sessionManager: SessionManager) {
    val rootController = rememberNavController()
    val isLoggedIn by sessionManager.isLoggedIn.collectAsState()

    LaunchedEffect(isLoggedIn) {
        if (!isLoggedIn) {
            rootController.navigate(NavRoutes.login()) {
                popUpTo(0) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    NavHost(navController = rootController, startDestination = NavRoutes.SPLASH) {
        composable(NavRoutes.SPLASH) {
            SplashScreen(
                onLoggedIn = {
                    rootController.navigate(NavRoutes.MAIN) {
                        popUpTo(NavRoutes.SPLASH) { inclusive = true }
                    }
                },
                onLoggedOut = { notice ->
                    rootController.navigate(NavRoutes.login(notice)) {
                        popUpTo(NavRoutes.SPLASH) { inclusive = true }
                    }
                },
            )
        }
        composable(
            NavRoutes.LOGIN,
            arguments = listOf(
                navArgument("notice") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) { backStackEntry ->
            LoginScreen(
                notice = backStackEntry.arguments?.getString("notice"),
                onLoggedIn = {
                    rootController.navigate(NavRoutes.MAIN) {
                        popUpTo(NavRoutes.LOGIN) { inclusive = true }
                    }
                },
            )
        }
        composable(NavRoutes.MAIN) {
            MainScaffold(
                onOpenPdf = { pdfId, title ->
                    rootController.navigate(NavRoutes.viewer(pdfId, title))
                },
                onOpenVideo = { videoId, title ->
                    rootController.navigate(NavRoutes.player(videoId, title))
                },
            )
        }
        composable(
            route = NavRoutes.VIEWER,
            arguments = listOf(
                navArgument("pdfId") { type = NavType.StringType },
                navArgument("title") {
                    type = NavType.StringType
                    defaultValue = ""
                },
            ),
        ) { backStackEntry ->
            val pdfId = backStackEntry.arguments?.getString("pdfId").orEmpty()
            // Navigation does not guarantee decoding of query args — decode here.
            val title = try {
                java.net.URLDecoder.decode(
                    backStackEntry.arguments?.getString("title").orEmpty(),
                    "UTF-8",
                )
            } catch (_: Exception) {
                backStackEntry.arguments?.getString("title").orEmpty()
            }
            PdfViewerScreen(
                pdfId = pdfId,
                title = title,
                onBack = { rootController.popBackStack() },
            )
        }
        composable(
            route = NavRoutes.PLAYER,
            arguments = listOf(
                navArgument("videoId") { type = NavType.StringType },
                navArgument("title") {
                    type = NavType.StringType
                    defaultValue = ""
                },
            ),
        ) { backStackEntry ->
            val videoId = backStackEntry.arguments?.getString("videoId").orEmpty()
            // Navigation does not guarantee decoding of query args — decode here.
            val title = try {
                java.net.URLDecoder.decode(
                    backStackEntry.arguments?.getString("title").orEmpty(),
                    "UTF-8",
                )
            } catch (_: Exception) {
                backStackEntry.arguments?.getString("title").orEmpty()
            }
            VideoPlayerScreen(
                videoId = videoId,
                title = title,
                onBack = { rootController.popBackStack() },
            )
        }
    }
}

@Composable
private fun MainScaffold(
    onOpenPdf: (String, String) -> Unit,
    onOpenVideo: (String, String) -> Unit,
) {
    val tabController = rememberNavController()
    Scaffold(
        bottomBar = {
            NavigationBar {
                val navBackStackEntry by tabController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination
                TABS.forEach { tab ->
                    NavigationBarItem(
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                        selected = currentDestination?.hierarchy?.any { it.route == tab.route } == true,
                        onClick = {
                            tabController.navigate(tab.route) {
                                popUpTo(tabController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = tabController,
            startDestination = Tabs.HOME,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Tabs.HOME) { HomeScreen(onOpenPdf = onOpenPdf) }
            composable(Tabs.LIBRARY) { LibraryScreen(onOpenPdf = onOpenPdf) }
            composable(Tabs.VIDEOS) { VideosScreen(onOpenVideo = onOpenVideo) }
            composable(Tabs.PROFILE) { ProfileScreen() }
        }
    }
}
