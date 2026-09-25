package com.securelearn.app.ui.navigation

/** Top-level destinations. */
object NavRoutes {
    const val SPLASH = "splash"
    /** Optional `notice` query param: an out-of-band message to show (e.g. root-block). */
    const val LOGIN = "login?notice={notice}"
    const val MAIN = "main"
    const val VIEWER = "viewer/{pdfId}?title={title}"
    const val PLAYER = "player/{videoId}?title={title}"

    fun login(notice: String? = null): String =
        if (notice.isNullOrBlank()) "login"
        else "login?notice=${java.net.URLEncoder.encode(notice, "UTF-8")}"

    fun viewer(pdfId: String, title: String): String =
        "viewer/$pdfId?title=${java.net.URLEncoder.encode(title, "UTF-8")}"

    fun player(videoId: String, title: String): String =
        "player/$videoId?title=${java.net.URLEncoder.encode(title, "UTF-8")}"
}

/** Bottom-navigation tabs inside MAIN. */
object Tabs {
    const val HOME = "tab_home"
    const val LIBRARY = "tab_library"
    const val VIDEOS = "tab_videos"
    const val PROFILE = "tab_profile"
}
