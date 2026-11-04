// Chạy thử với Strava giả lập (chạy được cả trên Windows/macOS/Linux)
process.env.STRAVA_MOCK = '1';
const { default: mod } = await import('../server.js');
const port = +process.env.PORT || 3000;
mod.server.listen(port, () => console.log(`Chạy Online (DEMO, Strava giả): http://localhost:${port}`));
