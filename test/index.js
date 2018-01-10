var assert = require('assert'),
    github = require('../index');

suite('Test github API wrapper isHttpMethod method', function() {
    test('HTTP methods return true', function() {
        assert.strictEqual(true, new github.GH().isHttpMethod("GET"));
        assert.strictEqual(true, new github.GH().isHttpMethod("POST"));
        assert.strictEqual(true, new github.GH().isHttpMethod("PUT"));
        assert.strictEqual(true, new github.GH().isHttpMethod("DELETE"));
        assert.strictEqual(true, new github.GH().isHttpMethod("PATCH"));
        assert.strictEqual(true, new github.GH().isHttpMethod("HEAD"));

        assert.strictEqual(true, new github.GH().isHttpMethod("get"));
        assert.strictEqual(true, new github.GH().isHttpMethod("post"));
        assert.strictEqual(true, new github.GH().isHttpMethod("put"));
        assert.strictEqual(true, new github.GH().isHttpMethod("delete"));
        assert.strictEqual(true, new github.GH().isHttpMethod("patch"));
        assert.strictEqual(true, new github.GH().isHttpMethod("head"));
    });
    test('Random inputs return false', function() {
        assert.strictEqual(false, new github.GH().isHttpMethod("FOO"));
        assert.strictEqual(false, new github.GH().isHttpMethod(""));
        assert.strictEqual(false, new github.GH().isHttpMethod());
        assert.strictEqual(false, new github.GH().isHttpMethod(null));
        assert.strictEqual(false, new github.GH().isHttpMethod({}));
        assert.strictEqual(false, new github.GH().isHttpMethod([]));
        assert.strictEqual(false, new github.GH().isHttpMethod(123));
    });
});

suite('Test github API wrapper method', function() {
    test('finds the method when using a doc API request', function() {
        assert.equal("get", new github.GH().method("GET /foo/:bar/index.html"));
        assert.equal("post", new github.GH().method("POST http://example.com"));
    });

    test('must return null when method cannot be parsed from doc API request', function() {
        assert.strictEqual(null, new github.GH().method("FOO /foo/:bar/index.html"));
    });

    test('must give precedence to the method found in the doc API request if any', function() {
        assert.equal("delete", new github.GH().method("DELETE /foo/:bar/index.html", { method: "post" }));
    });

    test('must fall back on the method provided in the option object', function() {
        assert.equal("post", new github.GH().method("/foo/:bar/baz", { method: "post" }));
    });

    test('must return null when method cannot be parsed from options object', function() {
        assert.strictEqual(null, new github.GH().method("/foo/:bar/index.html", { method: 'foo' }));
        assert.strictEqual(null, new github.GH().method("/foo/:bar/index.html", { }));
        assert.strictEqual(null, new github.GH().method("/foo/:bar/index.html"));
    });

    test('must default to null', function() {
        assert.strictEqual(null, new github.GH().method("/foo/:bar/baz"));
    });
});

suite('Test github API parseLinkHeader method', function() {
    var input = '<https://api.github.com/repositories/3618133/pulls?page=2>; rel="next", <https://api.github.com/repositories/3618133/pulls?page=4>; rel="last"'

    test('must correctly parse the value of the Link header', function() {
        assert.equal("https://api.github.com/repositories/3618133/pulls?page=4", new github.GH().parseLinkHeader(input).last);
        assert.equal("https://api.github.com/repositories/3618133/pulls?page=2", new github.GH().parseLinkHeader(input).next);
    });

    test('must always output an object', function() {
        assert.equal("object", typeof new github.GH().parseLinkHeader());
        assert.equal("object", typeof new github.GH().parseLinkHeader(input));
    });
});


suite('Test github API header method', function() {
    test('must allow setting headers with options.headers.', function() {
        assert.equal("image/png", new github.GH().headers({
            headers: { "Content-Type": "image/png" }
        })["Content-Type"]);
    });

    test('must always output an object', function() {
        assert.equal("object", typeof new github.GH().headers());
        assert.equal("object", typeof new github.GH({foo: "123"}).headers());
    });

    test('must return the useragent specified in the options object', function() {
        assert.equal("Foo", new github.GH().headers({ userAgent: "Foo" })["User-Agent"]);
    });

    test('must return the default userAgent if non is specified', function() {
        assert.ok(/^simple-github\/[0-9\.]+$/.test(new github.GH().headers()["User-Agent"]));
    });

    test('must return the Authorization header if a token is specified in the options.', function() {
        assert.equal("token bar", new github.GH().headers({ token: "bar" })["Authorization"]);
    });

});

suite('Test github API url method', function() {
    test('must deal with prefixed HTTP methods', function() {
        assert.equal('http://example.com/foo/bar', new github.GH({ baseURL: 'http://example.com/' }).url('GET /foo/bar'));
    });
    test('must correctly handle double slashes', function() {
        assert.equal('http://example.com/foo/bar', new github.GH({ baseURL: 'http://example.com/' }).url('/foo/bar'));
    });
    test('must correctly handle base url specified in the url itself', function() {
        assert.equal('http://example.com/foo/bar', new github.GH({ baseURL: 'http://example.com/' }).url('http://example.com/foo/bar'));
        assert.equal('http://foo.com/foo/bar', new github.GH({ baseURL: 'http://example.com/' }).url('http://foo.com/foo/bar'));
    });
    test('must default to github.BASE_URL as base url', function() {
        assert.equal(github.BASE_URL + 'foo/bar', new github.GH().url('/foo/bar'));
    });
    test('must interpolate GH API parameters of the form :foo', function() {
        assert.equal('https://api.github.com/123/bar', new github.GH().url('/:foo/bar', { foo: 123 }));
        assert.equal('https://api.github.com/baz/123/456', new github.GH().url('/baz/:foo/:bar', { foo: 123, bar: 456 }));
    });

    test('must throw when value for parameters of the form :foo are missing', function() {
        assert.throws(function() { new github.GH().url('/:foo/bar', { notfoo: 123 }); }, Error);
    });

    test('must not interpolate GH API parameters in the query string', function() {
        assert.equal('https://api.github.com/foo/bar?joe@exmaple.com+in:email', new github.GH().url('/foo/bar?joe@exmaple.com+in:email'));
    });
    test('must interpolte RFC 6570 parameters of the form: {foo}', function() {
        assert.equal('https://api.github.com/123/bar', new github.GH().url('/{foo}/bar', { foo: 123 }));
        assert.equal('https://api.github.com/baz/123/456', new github.GH().url('/baz/{foo}/{bar}', { foo: 123, bar: 456 }));
    });

    test('must throw when value for parameters of the form {foo} are missing', function() {
        assert.throws(function() { new github.GH().url('/{foo}/bar', { notfoo: 123 }); }, Error);
    });
});