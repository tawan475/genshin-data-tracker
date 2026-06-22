<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 class="text-sm font-medium text-slate-500 mb-1">Total Artifacts</h3>
        <p class="text-3xl font-bold text-slate-900">0</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 class="text-sm font-medium text-slate-500 mb-1">Characters Synced</h3>
        <p class="text-3xl font-bold text-slate-900">0</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 class="text-sm font-medium text-slate-500 mb-1">Active Accounts</h3>
        <p class="text-3xl font-bold text-slate-900">0</p>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-200">
        <h3 class="text-base font-semibold text-slate-900">Recent Sync Activity</h3>
      </div>
      <div class="p-6 text-center text-slate-500 py-12">
        No recent activity found. Head over to Accounts to generate an Import Key.
      </div>
    </div>
  </div>
</template>
