/** ID tugas dari URL ClickUp (app.clickup.com/t/…), tautan kartu aplikasi (/t/<id>), atau null. */
export function idDariRujukan(q: string): string | null {
  const s = q.trim();
  const m = s.match(/app\.clickup\.com\/t\/(?:\d+\/)?([A-Za-z0-9_-]+)/) ?? s.match(/\/t\/([A-Za-z0-9_-]+)(?:[/?#]|$)/);
  return m ? m[1] : null;
}
