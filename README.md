# submodule-consumer

Vendors [`shared-schema`](https://github.com/zed-pkg-test/shared-schema) as a
**git submodule** at `vendor/schema`, and `src/index.js` reads
`vendor/schema/schema.json` at require time — so the file has to survive into the
published artifact or every consumer breaks.

[`subtree-consumer`](https://github.com/zed-pkg-test/subtree-consumer) vendors
the identical content with `git subtree`. The pair exists to show that the choice
is not cosmetic.

## The failure: a silent, partial publish

`zed pack` walks the **filesystem**, not git. A submodule directory is empty
until someone initializes it, and an empty directory contributes nothing — so
packing without `git submodule update --init` produces a smaller artifact with
no error, no warning, and exit status 0.

| | Files packed | `vendor/schema/schema.json` |
| --- | --- | --- |
| `git submodule update --init` first | 11 | present |
| Plain `git clone` (submodule left empty) | **6** | **missing** |

The second artifact is structurally valid and completely broken:

```console
$ tar xzf zedtest-submodule-consumer-0.1.0.tar.gz && cd pkg
$ node -e 'require("./src/index.js")'
Error: ENOENT: no such file or directory, open '…/pkg/vendor/schema/schema.json'
```

This is the default path, not an exotic one. `git clone` does not fetch
submodules, and `actions/checkout` does not either unless you pass
`submodules: true`. A release job that forgets it ships a broken package and
reports success.

**Mitigation:** initialize submodules before packing, and assert the vendored
file exists as a publish gate rather than trusting the checkout. The CI here does
both, and additionally packs *without* the submodule to prove the failure is
still real.

## Two smaller warts, when it does work

Even with the submodule checked out, the artifact carries things it should not:

```
pkg/vendor/schema/.git          <- gitlink pointer file
pkg/vendor/schema/README.md     <- nested README
```

- `vendor/schema/.git` is the submodule's gitlink — a one-line file pointing at
  `../../.git/modules/vendor/schema`. The default exclude is `.git/**`, which
  matches a `.git` *directory* at the root; a `.git` *file* nested inside a
  submodule escapes it. It ships a dangling pointer into every consumer's
  install.
- `README*` likewise anchors at the package root, so a nested `README.md` is not
  excluded the way the top-level one is.

Neither breaks anything at runtime; both are artifact bloat that a `**/`-prefixed
pattern would fix.

## Same root cause: publish is filesystem-based, not git-based

The exclusion list is the built-in globs plus `publish.exclude` plus
`.zedignore`. **`.gitignore` is never consulted.** So anything sitting in the
working tree is a publish candidate no matter what git thinks of it:

```console
$ cat .gitignore
.env
secrets.json

$ git status --porcelain --ignored | grep '^!!'
!! .env
!! secrets.json

$ zed pack && tar tzf .zed/pack/*.tar.gz
pkg/.env            # <- DB_PASSWORD=hunter2
pkg/secrets.json    # <- {"apiKey":"sk-live-…"}
pkg/.zpkg.toml
pkg/LICENSE
pkg/src/index.js
```

Both files were published. Every developer's mental model is "gitignored means
not shipped", and here it does not hold. Adding a `.zedignore` with the same
lines fixes it (and `.zedignore` itself is excluded by default):

```console
$ printf '.env\nsecrets.json\n' > .zedignore
$ zed pack && tar tzf .zed/pack/*.tar.gz
pkg/.gitignore
pkg/.zpkg.toml
pkg/LICENSE
pkg/src/index.js
```

Having `.gitignore` seed the default excludes — or warning when a packed file is
git-ignored — would close the gap. Until then, `.zedignore` has to duplicate
every sensitive entry by hand.

## License

MIT
