import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111">
<canvas id="c" width="1280" height="720"></canvas>
<script>
const c = document.getElementById('c'), x = c.getContext('2d')
const MONO = '"Cascadia Code", Consolas, monospace'
const SANS = '"Segoe UI", system-ui, sans-serif'
const INK='#e6edf3', DIM='#8b9bb0', ACC='#ff7a1a', GRN='#27c93f', RED='#ff5f56', AMB='#ffbd2e'

x.fillStyle='#0b0f14'; x.fillRect(0,0,1280,720)
const g = x.createRadialGradient(1180,-60,0,1180,-60,760)
g.addColorStop(0,'rgba(255,122,26,0.15)'); g.addColorStop(1,'rgba(255,122,26,0)')
x.fillStyle=g; x.fillRect(0,0,1280,720)

function rr(X,Y,W,H,R){x.beginPath();x.moveTo(X+R,Y);x.arcTo(X+W,Y,X+W,Y+H,R);x.arcTo(X+W,Y+H,X,Y+H,R);x.arcTo(X,Y+H,X,Y,R);x.arcTo(X,Y,X+W,Y,R);x.closePath()}
function sp(t,X,Y,s){ let cx=X; for(const ch of t){ x.fillText(ch,cx,Y); cx+=x.measureText(ch).width+s } return cx }

x.textBaseline='alphabetic'
x.fillStyle=ACC; x.font='bold 17px '+SANS
sp('BUILD BEFORE Q-DAY  ·  QUANTUM PASS', 72, 96, 2.6)

x.fillStyle=INK; x.font='bold 66px '+MONO
x.fillText('qorechain-pq-check', 70, 170)

x.fillStyle=DIM; x.font='24px '+SANS
x.fillText("Would this account's next EVM transaction be admitted —", 72, 214)
x.fillText('and if not, which of the three reasons is it?', 72, 246)

const TX=72, TY=286, TW=1136, TH=268
x.fillStyle='#121923'; rr(TX,TY,TW,TH,14); x.fill()
x.strokeStyle='#1f2b38'; x.lineWidth=1; rr(TX,TY,TW,TH,14); x.stroke()
x.beginPath(); x.moveTo(TX,TY+46); x.lineTo(TX+TW,TY+46); x.stroke()
;[[RED,0],[AMB,22],[GRN,44]].forEach(([col,dx])=>{x.fillStyle=col;x.beginPath();x.arc(TX+26+dx,TY+23,6,0,7);x.fill()})
x.fillStyle=DIM; x.font='14px '+MONO
x.fillText('npm run check -- qor1ketz…k0stcg', TX+108, TY+28)

x.font='21px '+MONO
const R1=TY+96, R2=TY+132
x.fillStyle=DIM; x.fillText('post-quantum key', TX+34, R1)
x.fillStyle=INK; x.fillText('registered', TX+266, R1)
x.fillStyle=DIM; x.fillText('evm window', TX+560, R1)
x.fillStyle=INK; x.fillText('live', TX+740, R1)
x.fillStyle=DIM; x.fillText('algorithm id', TX+34, R2)
x.fillStyle=INK; x.fillText('1', TX+266, R2)
x.fillStyle=DIM; x.fillText('txs left', TX+560, R2)
x.fillStyle=INK; x.fillText('3 / 5', TX+740, R2)

const SY=TY+214
x.font='bold 27px '+MONO
let cx=TX+34
x.fillStyle=RED; x.fillText('no-pqc-key',cx,SY); cx+=x.measureText('no-pqc-key').width+22
x.fillStyle=ACC; x.fillText('→',cx,SY); cx+=x.measureText('→').width+22
x.fillStyle=AMB; x.fillText('no-window',cx,SY); cx+=x.measureText('no-window').width+22
x.fillStyle=ACC; x.fillText('→',cx,SY); cx+=x.measureText('→').width+22
x.fillStyle=GRN; x.fillText('ready',cx,SY)

x.font='19px '+SANS; x.fillStyle=DIM
x.fillText('Reads only —', 72, 646)
const w=x.measureText('Reads only — ').width
x.fillStyle=INK; x.font='bold 19px '+SANS
x.fillText('no private key, no gas, no funded account', 72+w, 646)

x.font='16px '+MONO
const pill='@qorechain/sdk · @qorechain/evm · MIT'
const pw=x.measureText(pill).width+36
x.strokeStyle='#1f2b38'; rr(1208-pw,624,pw,34,17); x.stroke()
x.fillStyle=DIM; x.fillText(pill, 1208-pw+18, 646)

fetch('/save',{method:'POST',headers:{'content-type':'text/plain'},body:c.toDataURL('image/png')})
  .then(r=>r.text()).then(t=>{document.title='SAVED '+t})
</script></body>`

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    let b = ''
    req.on('data', (d) => (b += d))
    req.on('end', () => {
      const png = Buffer.from(b.split(',')[1], 'base64')
      writeFileSync(new URL('./featured.png', import.meta.url), png)
      res.writeHead(200); res.end(String(png.length))
      console.log('wrote featured.png', png.length, 'bytes')
    })
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(PAGE)
}).listen(8778, () => console.log('render server on http://localhost:8778'))
