(function () {
  try {
    const grids = (window.jQuery && window.jQuery('.dx-datagrid')) || [];
    const data = [];
    grids.each(function () {
      try {
        const inst = window.jQuery(this).dxDataGrid('instance');
        if (!inst) return;
        const ds = inst.option('dataSource');
        data.push({
          id: this.id || null,
          rowCount: inst.totalCount(),
          sample: Array.isArray(ds) ? ds.slice(0, 2) : null
        });
      } catch (_) {}
    });
    window.postMessage({
      source: 'shiftia-bridge',
      payload: {
        actaisApp: window.actaisApp ? { workerMode: window.actaisApp.workerMode, modules: window.actaisApp.Modules } : null,
        grids: data,
        langId: window.langId ?? null
      }
    }, '*');
  } catch (e) {
    console.warn('[shiftia-bridge]', e);
  }
})();
