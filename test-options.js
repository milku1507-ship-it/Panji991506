import fetch from 'node-fetch';
async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/parse-hpp', { method: 'OPTIONS' });
    console.log(res.status);
    console.log(res.headers);
  } catch (e) { console.error(e); }
}
run();
