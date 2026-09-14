# Safari WebTransport vs kubo

Can Safari open a WebTransport session to a [kubo](https://github.com/ipfs/kubo) node, the way [js-libp2p](https://github.com/libp2p/js-libp2p) does it? The test dials a kubo node from real Safari on a `macos-26` GitHub runner, using `serverCertificateHashes` taken from the node's `/certhash/` multiaddr and the libp2p well-known path. Chrome dials the same node as a harness check.

## Why this exists

kubo v0.43.1 moves to [quic-go v0.62.0](https://github.com/quic-go/quic-go/releases/tag/v0.62.0), which forces [webtransport-go v0.13.0](https://github.com/quic-go/webtransport-go/releases/tag/v0.13.0). That version sends the WebTransport session flow-control settings only when the server configures limits, and an open upstream report ([quic-go/webtransport-go#355](https://github.com/quic-go/webtransport-go/issues/355)) says Safari fails against servers that send none. go-libp2p's listener configures no limits, so kubo would have been such a server.

## Result

| kubo | go-libp2p | webtransport-go | Safari 26.6 | Chrome 152 |
|------|-----------|-----------------|-------------|------------|
| [v0.43.0](https://github.com/ipfs/kubo/commit/e9914bb478b3d59ac77d33cd36ad5b4d76283807) | [v0.49.0](https://github.com/libp2p/go-libp2p/releases/tag/v0.49.0) | v0.11.1 | [pass](https://github.com/lidel/wt-safari-test/actions/runs/34886268822/job/104117588847) | pass |
| [release-v0.43.1 @ 14f521e](https://github.com/ipfs/kubo/commit/14f521e56ed84c51fc3d118da55310b388ce787d) | v0.49.0 | v0.11.1 | [pass](https://github.com/lidel/wt-safari-test/actions/runs/34886268822/job/104117588846) | pass |
| same, with go-libp2p fork [@ 1ae7176](https://github.com/lidel/go-libp2p/commit/1ae71762d638fa3ca524c151d7d3f5fdbdffd51c) (quic-go v0.62.0 bump) | fork | v0.13.0 | [**fail**](https://github.com/lidel/wt-safari-test/actions/runs/34882448508/job/104104789970) | pass |
| same, with go-libp2p fork [@ 9c4ee60](https://github.com/lidel/go-libp2p/commit/9c4ee60cf92441a97ac300b258da906668c9a011) (bump + listener fix) | fork | v0.13.0 | [pass](https://github.com/lidel/wt-safari-test/actions/runs/34886268822/job/104117588631) | pass |

**What failed:** with the plain quic-go bump, Safari reports the session as ready, then never opens a bidirectional stream, and the session closes with an empty `WebTransportError`. Chrome is fine against the same node. This is the failure shape from quic-go/webtransport-go#355 and [hyperium/h3#347](https://github.com/hyperium/h3/issues/347).

**What fixed it:** [lidel/go-libp2p@9c4ee60](https://github.com/lidel/go-libp2p/commit/9c4ee60cf92441a97ac300b258da906668c9a011), five lines in the WebTransport listener that set `webtransport.Config` limits, so the server advertises the `WT_INITIAL_MAX_*` settings again. The limits are the maximum the settings carry and never bind; the QUIC per-connection limits and the libp2p resource manager stay the effective caps. The fork branch is [`chore/bump-quic-go-v0.62.0`](https://github.com/lidel/go-libp2p/tree/chore/bump-quic-go-v0.62.0), which is upstream go-libp2p master plus the bump plus this fix.

Run [34882448508](https://github.com/lidel/wt-safari-test/actions/runs/34882448508) has the failing and the fixed job side by side, the fix applied there as a patch. Run [34886268822](https://github.com/lidel/wt-safari-test/actions/runs/34886268822) tests the fork commit kubo v0.43.1 pins.

## How it works

One job per matrix entry in [`.github/workflows/test.yml`](.github/workflows/test.yml):

1. Check out `ipfs/kubo` at the ref. If the entry names a go-libp2p replacement, apply it with `go mod edit -replace` and `go mod tidy`.
2. Build kubo, start it with a single listener on `/ip4/127.0.0.1/udp/4321/quic-v1/webtransport`, read the `/certhash/` multiaddr from `ipfs id`.
3. [`driver.mjs`](driver.mjs) serves [`page/index.html`](page/index.html) on `localhost` and opens it in Safari through SafariDriver, then in Chrome. The page decodes the certhashes, dials `https://127.0.0.1:4321/.well-known/libp2p-webtransport?type=noise`, awaits `ready`, opens a bidirectional stream, and writes one byte. It reports `PASS` or the error.
4. `daemon.log` and the server's qlog traces are uploaded as artifacts.

## Reading a result

| Safari, control | Safari, candidate | Chrome | Meaning |
|-----------------|-------------------|--------|---------|
| pass | fail | pass | the candidate regresses Safari |
| pass | pass | pass | Safari is not affected |
| fail | fail | pass | Safari rejects this dial shape (IP literal, certhash) |
| any | any | fail | harness problem, look at the page log and `daemon.log` |

## Testing another combination

Edit `matrix.include` in the workflow. `kubo_ref` takes any tag, branch, or commit of `ipfs/kubo`; `libp2p_replace` takes a `module@version` for `go mod edit -replace`.

## Running the browser part locally

```
node driver.mjs safari "$(ipfs id -f '<addrs>\n' | grep certhash | head -1)"
```

Needs `safaridriver --enable` once, and a kubo daemon listening on `/ip4/127.0.0.1/udp/4321/quic-v1/webtransport`. `HEADLESS=1 node driver.mjs chrome ...` runs Chrome without a window.
