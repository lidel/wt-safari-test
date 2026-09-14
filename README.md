# Safari WebTransport vs kubo

Checks whether Safari can open a WebTransport session to a kubo node, the way
js-libp2p does it: `serverCertificateHashes` from the `/certhash/` multiaddr,
dialed at the libp2p well-known path. Motivation: quic-go/webtransport-go#355.

The workflow runs on a `macos-26` GitHub runner (Safari 26.6). For each kubo
ref in the matrix it builds kubo, starts it with a WebTransport-only listener
on 127.0.0.1, then dials it from Safari and, as a harness check, from Chrome.

## Reading the result

| Safari, control ref | Safari, candidate ref | Chrome | Meaning                                                |
|---------------------|-----------------------|--------|--------------------------------------------------------|
| PASS                | FAIL                  | PASS   | the candidate regresses Safari                         |
| PASS                | PASS                  | PASS   | Safari is not affected                                 |
| FAIL                | FAIL                  | PASS   | Safari rejects this dial shape (IP literal, certhash)  |
| any                 | any                   | FAIL   | harness problem, look at the page log and daemon.log   |

## Changing the refs

Edit `matrix.kubo_ref` in `.github/workflows/test.yml`. Any tag, branch, or
commit of `ipfs/kubo` works.

## Running the browser part locally

```
node driver.mjs safari "$(ipfs id -f '<addrs>\n' | grep certhash | head -1)"
```

Needs `safaridriver --enable` once, and a kubo daemon listening on
`/ip4/127.0.0.1/udp/4321/quic-v1/webtransport`.
