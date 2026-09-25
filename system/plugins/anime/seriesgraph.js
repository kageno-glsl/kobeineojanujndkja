import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
//=================
class SeriesGraph {
constructor() {
this.showId = null;
this.detail = {};
this.ratings = {};
this.title = "Unknown Series";
this.userName = "Official Ratings";
this.posterUrl = null;
this.backdropUrl = null;
this.dataMatrix = {};
this.maxEpisodes = 0;
this.sortedSeasons = [];
}
#getRatingColor(rating) {
const val = parseFloat(rating);
if (isNaN(val)) return '#1e1e24';
if (val >= 9.0) return '#15803d';
if (val >= 8.0) return '#16a34a';
if (val >= 7.0) return '#eab308';
if (val >= 6.0) return '#f97316';
return '#dc2626';
}
async fetch(query) {
this.showId = query;
if (typeof query === 'string' && isNaN(query)) {
const searchUrl = `https://seriesgraph.com/api/shows/search?searchTerm=${encodeURIComponent(query)}&language=en-US`;
const searchRes = await axios.get(searchUrl, { headers: { 'User-Agent': 'okhttp/4.12.0' } });
if (!searchRes.data?.results?.length) {
throw new Error(`Series dengan judul "${query}" tidak ditemukan.`);
}
const topResult = searchRes.data.results[0];
this.showId = topResult.id;
}
const detailRes = await axios.get(`https://seriesgraph.com/api/shows/${this.showId}`).catch(() => null);
this.detail = detailRes ? detailRes.data : {}; 
this.title = this.detail.name || "Unknown Series";
this.posterUrl = this.detail.poster_path ? `https://image.tmdb.org/t/p/w500${this.detail.poster_path}` : null;
this.backdropUrl = this.detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${this.detail.backdrop_path}` : null;
const chartUrl = `https://seriesgraph.com/api/custom-charts/by-show/${this.showId}?limit=10`;
const chartRes = await axios.get(chartUrl).catch(() => ({ data: { charts: [] } }));
let chartData = chartRes.data?.charts?.length ? chartRes.data.charts[0] : null;
if (chartData) {
this.title = chartData.showName;
this.userName = chartData.userName;
this.ratings = chartData.ratings;
if (chartData.posterPath) this.posterUrl = `https://image.tmdb.org/t/p/w500${chartData.posterPath}`;
} else {
const seasonRes = await axios.get(`https://seriesgraph.com/api/shows/${this.showId}/season-ratings`).catch(() => ({ data: [] }));
seasonRes.data.forEach(s => {
if (s.episodes) {
s.episodes.forEach(e => {
if (e.vote_average) {
this.ratings[`S${e.season_number}E${e.episode_number}`] = e.vote_average;
}
});
}
});
}
if (Object.keys(this.ratings).length === 0) {
throw new Error(mess.wrong);
}
const seasonsSet = new Set();
Object.keys(this.ratings).forEach(key => {
const match = key.match(/S(\d+)E(\d+)/);
if (match) {
const s = parseInt(match[1]);
const e = parseInt(match[2]);
seasonsSet.add(s);
if (e > this.maxEpisodes) this.maxEpisodes = e;
if (!this.dataMatrix[e]) this.dataMatrix[e] = {};
this.dataMatrix[e][s] = this.ratings[key].toFixed(1);
}
});
this.sortedSeasons = Array.from(seasonsSet).sort((a, b) => a - b);
if (this.detail.poster_path && !this.detail.poster_path.startsWith('http')) {
this.detail.poster_path = `https://image.tmdb.org/t/p/w500${this.detail.poster_path}`;
}
if (this.detail.backdrop_path && !this.detail.backdrop_path.startsWith('http')) {
this.detail.backdrop_path = `https://image.tmdb.org/t/p/w780${this.detail.backdrop_path}`;
}
if (this.detail.logo_path && !this.detail.logo_path.startsWith('http')) {
this.detail.logo_path = `https://image.tmdb.org/t/p/w500${this.detail.logo_path}`;
}
this.detail.episode_ratings = this.ratings;
return this;
}
toJson() {
return this.detail;
}
async renderImage() {
const cellWidth = 90;
const cellHeight = 45;
const padding = 25;
const headerHeight = 70; 
const sidebarWidth = 240;
const tableWidth = (1 + this.sortedSeasons.length) * cellWidth;
const tableHeight = (1 + this.maxEpisodes + 1) * cellHeight;
const canvasWidth = Math.max(sidebarWidth + tableWidth + (padding * 2), 780);
let imgBackdrop = null;
let backdropHeight = 0;
if (this.backdropUrl) {
try {
imgBackdrop = await loadImage(this.backdropUrl);
const imageRatio = imgBackdrop.width / imgBackdrop.height;
backdropHeight = canvasWidth / Math.max(imageRatio, 1.0);
} catch (err) {
backdropHeight = 0;
}
} 
const canvasHeight = headerHeight + backdropHeight + tableHeight + (padding * 2);
const canvas = createCanvas(canvasWidth, canvasHeight);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#0b0b0e';
ctx.fillRect(0, 0, canvasWidth, canvasHeight);
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 24px sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';
ctx.fillText('SERIES GRAPH', padding, headerHeight / 2);
ctx.textAlign = 'right';
ctx.font = 'italic 18px sans-serif';
ctx.fillStyle = '#9ca3af';
ctx.fillText(this.title.toUpperCase(), canvasWidth - padding, headerHeight / 2); 
if (imgBackdrop) {
try {
const imageRatio = imgBackdrop.width / imgBackdrop.height;
const targetRatio = canvasWidth / backdropHeight;
let sx, sy, sWidth, sHeight;
if (imageRatio > targetRatio) {
sHeight = imgBackdrop.height;
sWidth = imgBackdrop.height * targetRatio;
sx = (imgBackdrop.width - sWidth) / 2; sy = 0;
} else {
sWidth = imgBackdrop.width;
sHeight = imgBackdrop.width / targetRatio;
sx = 0; sy = (imgBackdrop.height - sHeight) / 2;
}
ctx.drawImage(imgBackdrop, sx, sy, sWidth, sHeight, 0, headerHeight, canvasWidth, backdropHeight);
} catch (err) {}
}
const contentStartY = headerHeight + backdropHeight + padding;
if (this.posterUrl) {
try {
const imgPoster = await loadImage(this.posterUrl);
ctx.save();
ctx.beginPath();
ctx.roundRect(padding, contentStartY, 180, 255, 8);
ctx.clip();
ctx.drawImage(imgPoster, padding, contentStartY, 180, 255);
ctx.restore();
} catch (err) {}
}
ctx.textAlign = 'left';
ctx.textBaseline = 'top';
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 20px sans-serif'; 
let words = this.title.split(' ');
let line = '';
let currentY = contentStartY + 270;
for (let n = 0; n < words.length; n++) {
let testLine = line + words[n] + ' ';
if (testLine.length > 20 && n > 0) {
ctx.fillText(line, padding, currentY);
line = words[n] + ' ';
currentY += 26;
} else {
line = testLine;
}
}
ctx.fillText(line, padding, currentY);
ctx.fillStyle = '#6b7280';
ctx.font = '13px sans-serif';
ctx.fillText(`Chart by: ${this.userName}`, padding, currentY + 22);
currentY += 50;
ctx.font = 'bold 12px sans-serif';
if (this.detail.status) {
ctx.fillStyle = '#9ca3af'; ctx.fillText('STATUS', padding, currentY);
ctx.fillStyle = '#ffffff'; ctx.font = '13px sans-serif'; ctx.fillText(this.detail.status, padding, currentY + 16);
currentY += 38;
}
if (this.detail.first_air_date) {
ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('FIRST AIR DATE', padding, currentY);
ctx.fillStyle = '#ffffff'; ctx.font = '13px sans-serif'; ctx.fillText(this.detail.first_air_date, padding, currentY + 16);
currentY += 38;
}
if (this.detail.vote_average) {
ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('GLOBAL RATING', padding, currentY);
ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`${this.detail.vote_average} (${this.detail.vote_count || 0} votes)`, padding, currentY + 16);
}
const startX = padding + sidebarWidth;
const startY = contentStartY;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#9ca3af';
ctx.font = 'bold 15px sans-serif';
this.sortedSeasons.forEach((season, index) => {
const x = startX + cellWidth + (index * cellWidth);
ctx.fillText(`S${season}`, x + (cellWidth / 2), startY + (cellHeight / 2));
}); 
for (let e = 1; e <= this.maxEpisodes; e++) {
const rowY = startY + (e * cellHeight);
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 14px sans-serif';
ctx.fillText(`E${e}`, startX + (cellWidth / 2), rowY + (cellHeight / 2));
this.sortedSeasons.forEach((season, sIndex) => {
const x = startX + cellWidth + (sIndex * cellWidth);
const ratingValue = this.dataMatrix[e] && this.dataMatrix[e][season] ? this.dataMatrix[e][season] : '-';
if (ratingValue !== '-') {
ctx.fillStyle = this.#getRatingColor(ratingValue);
ctx.beginPath(); ctx.roundRect(x + 4, rowY + 4, cellWidth - 8, cellHeight - 8, 6); ctx.fill();
ctx.fillStyle = '#000000'; ctx.font = 'bold 14px sans-serif';
ctx.fillText(ratingValue, x + (cellWidth / 2), rowY + (cellHeight / 2));
} else {
ctx.fillStyle = '#1f2937'; ctx.fillText('-', x + (cellWidth / 2), rowY + (cellHeight / 2));
}
});
}
const avgRowY = startY + ((this.maxEpisodes + 1) * cellHeight);
ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px sans-serif';
ctx.fillText('AVG', startX + (cellWidth / 2), avgRowY + (cellHeight / 2));
this.sortedSeasons.forEach((season, sIndex) => {
const x = startX + cellWidth + (sIndex * cellWidth);
let sum = 0, count = 0;
for (let e = 1; e <= this.maxEpisodes; e++) {
if (this.dataMatrix[e] && this.dataMatrix[e][season]) {
sum += parseFloat(this.dataMatrix[e][season]);
count++;
}
}
const seasonAvg = count > 0 ? (sum / count).toFixed(1) : '-';
ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px sans-serif';
ctx.fillText(seasonAvg, x + (cellWidth / 2), avgRowY + (cellHeight / 2));
ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3;
ctx.beginPath(); ctx.moveTo(x + 20, avgRowY + cellHeight - 6); ctx.lineTo(x + cellWidth - 20, avgRowY + cellHeight - 6); ctx.stroke();
});
return canvas.toBuffer('image/png');
}
}
//=================
const handler = async (m, { conn, isBotAdmins, isAdmins, command, args, text, isAccess, prefix }) => {
if (!text) {
return m.reply(`-Example: ${prefix + command} (title)`);
}
try {
await m.reply(mess.wait);
const seriesGraph = new SeriesGraph();
await seriesGraph.fetch(text); 
const imageBuffer = await seriesGraph.renderImage();
const caption = `*⌗ Series Graph*
> *Title:* ${seriesGraph.title}
> *Global Rating:* ${seriesGraph.detail.vote_average || 'N/A'}
> *First Air:* ${seriesGraph.detail.first_air_date || 'N/A'}
> *Status:* ${seriesGraph.detail.status || 'N/A'}`;
await conn.sendMessage(m.chat, { 
image: imageBuffer, 
caption: caption 
}, { quoted: m });
} catch (err) {
console.error("Handler:", err.message);
m.reply(mess.error);
}
};
//=================
handler.command = ["sgraph"];
export default handler;
