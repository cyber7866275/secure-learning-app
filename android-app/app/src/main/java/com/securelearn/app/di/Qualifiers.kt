package com.securelearn.app.di

import javax.inject.Qualifier

/** OkHttpClient / Retrofit without auth (token refresh, downloads). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PlainClient

/** OkHttpClient / Retrofit with AuthInterceptor + TokenAuthenticator. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AuthClient
