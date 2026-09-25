package com.securelearn.app.data.repository

import com.securelearn.app.data.remote.ApiService
import com.securelearn.app.di.AuthClient
import javax.inject.Singleton

@Singleton
class DeviceRepository constructor(
    @AuthClient private val api: ApiService,
) {
    suspend fun myDevices() = api.myDevices()
}
