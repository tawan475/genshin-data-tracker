<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-colors">
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 transition-colors">Total Artifacts</h3>
        <p class="text-3xl font-bold text-slate-900 dark:text-white transition-colors">0</p>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-colors">
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 transition-colors">Characters Synced</h3>
        <p class="text-3xl font-bold text-slate-900 dark:text-white transition-colors">0</p>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-colors">
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 transition-colors">Active Accounts</h3>
        <p class="text-3xl font-bold text-slate-900 dark:text-white transition-colors">0</p>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
      <div class="px-6 py-5 border-b border-slate-200 dark:border-slate-700 transition-colors">
        <h3 class="text-base font-semibold text-slate-900 dark:text-white transition-colors">Recent Sync Activity</h3>
      </div>
      <div class="p-6 text-center text-slate-500 dark:text-slate-400 py-12 transition-colors">
        No recent activity found. Head over to Accounts to generate an Import Key.
      </div>
    </div>
  </div>
</template>
