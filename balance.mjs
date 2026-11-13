const QOR = 'qor1ketzqqfqda7weuz2aj84fapgcjurqer6k0stcg'
const EVM = '0xb6562001206f7cecf04aec8f54f428c4b830647a'

async function j(url, init) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    return { status: r.status, body: await r.json() }
  } catch (e) { return { status: 'ERR', body: String(e.message).slice(0, 70) } }
}

console.log('=== native balance over REST (cosmos bank) ===')
const b = await j(`https://api-testnet.qore.host/cosmos/bank/v1beta1/balances/${QOR}`)
console.log(' status', b.status)
console.log(' ', JSON.stringify(b.body).slice(0, 300))

console.log('\n=== same account over the EVM lane ===')
const e = await j('https://evm-testnet.qore.host', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [EVM, 'latest'] }),
})
console.log(' status', e.status, JSON.stringify(e.body).slice(0, 200))
if (e.body?.result) {
  const wei = BigInt(e.body.result)
  console.log(' wei :', wei.toString())
  console.log(' QOR :', (Number(wei) / 1e18).toString())
}
