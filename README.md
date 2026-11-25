# netlify-plugin-bitbison-code

Bitbison Code on Netlify: where a build's dependency changes stand, in the
deploy summary.

## Usage

Set the site's `BITBISON_TOKEN` environment variable to your organization's
CI token, then add the plugin to `netlify.toml`:

```toml
[[plugins]]
  package = "netlify-plugin-bitbison-code"
  [plugins.inputs]
    org = "<your organization's id>"
    url = "https://<your Bitbison deployment>"
    target = "main"
```

`target` is the branch pull requests merge into.
