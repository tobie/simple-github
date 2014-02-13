Simple GitHub
=============

A simple, request-inspired and promise-based wrapper around GitHub's API.

The idea here is to simplify interacting with the GH API for basic scenarios.
It uses Q promises (as promises are such a nicer abstraction then callbacks).
It doesn't support streaming at present mostly because I didn't really need
streaming for my use cases, and also because I'm still trying to figure out
what the best practice is for handling streams in node.js (especially when
these contain JSON data you want to parse).

The data set I'm working with and my use cases makes it so that it perfectly
reasonable to send multiple gets and lump together the output of paginated data
when fulfilling the promise. This might turn out to be a bad idea but I don't
know better for now.

Because what I want to do is use the API as quickly as possible, this module
supports copy pasting the URLs directly from the documentation:

``` js
var gh = require("simple-github")({
  owner: "tobie",
  repo: "simple-github"
});

gh.request("GET /repos/:owner/:repo/commits").then(console.log);
```

Interpolation is automatic.

Similarly, simple-github also accepts URI templates (as these are common in
the GitHub API):

``` js
var gh = require("simple-github")({
  owner: "tobie",
  repo: "simple-github"
});

gh.request("https://api.github.com/repos/{owner}/{repo}/commits", { method: "get" }).then(console.log);
```
