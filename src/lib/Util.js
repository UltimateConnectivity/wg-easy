'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');

module.exports = class Util {

  __gf(init) {
		var r = new Float64Array(16);
		if (init) {
			for (var i = 0; i < init.length; ++i)
				r[i] = init[i];
		}
		return r;
	}

	__pack(o, n) {
		var b, m = gf(), t = gf();
		for (var i = 0; i < 16; ++i)
			t[i] = n[i];
		this.__carry(t);
		this.__carry(t);
		this.__carry(t);
		for (var j = 0; j < 2; ++j) {
			m[0] = t[0] - 0xffed;
			for (var i = 1; i < 15; ++i) {
				m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
				m[i - 1] &= 0xffff;
			}
			m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
			b = (m[15] >> 16) & 1;
			m[14] &= 0xffff;
			cswap(t, m, 1 - b);
		}
		for (var i = 0; i < 16; ++i) {
			o[2 * i] = t[i] & 0xff;
			o[2 * i + 1] = t[i] >> 8;
		}
	}

	__carry(o) {
		var c;
		for (var i = 0; i < 16; ++i) {
			o[(i + 1) % 16] += (i < 15 ? 1 : 38) * Math.floor(o[i] / 65536);
			o[i] &= 0xffff;
		}
	}

	__cswap(p, q, b) {
		var t, c = ~(b - 1);
		for (var i = 0; i < 16; ++i) {
			t = c & (p[i] ^ q[i]);
			p[i] ^= t;
			q[i] ^= t;
		}
	}

	__add(o, a, b) {
		for (var i = 0; i < 16; ++i)
			o[i] = (a[i] + b[i]) | 0;
	}

	__subtract(o, a, b) {
		for (var i = 0; i < 16; ++i)
			o[i] = (a[i] - b[i]) | 0;
	}

	__multmod(o, a, b) {
		var t = new Float64Array(31);
		for (var i = 0; i < 16; ++i) {
			for (var j = 0; j < 16; ++j)
				t[i + j] += a[i] * b[j];
		}
		for (var i = 0; i < 15; ++i)
			t[i] += 38 * t[i + 16];
		for (var i = 0; i < 16; ++i)
			o[i] = t[i];
		this.__carry(o);
		this.__carry(o);
	}

	__invert(o, i) {
		var c = gf();
		for (var a = 0; a < 16; ++a)
			c[a] = i[a];
		for (var a = 253; a >= 0; --a) {
			this.__multmod(c, c, c);
			if (a !== 2 && a !== 4)
				this.__multmod(c, c, i);
		}
		for (var a = 0; a < 16; ++a)
			o[a] = c[a];
	}

	static __clamp(z) {
		z[31] = (z[31] & 127) | 64;
		z[0] &= 248;
	}

	static generatePublicKey(privateKey) {
		var r, z = new Uint8Array(32);
		var a = this.__gf([1]),
			b = this.__gf([9]),
			c = this.__gf(),
			d = this.__gf([1]),
			e = this.__gf(),
			f = this.__gf(),
			_121665 = this.__gf([0xdb41, 1]),
			_9 = this.__gf([9]);
		for (var i = 0; i < 32; ++i)
			z[i] = privateKey[i];
		this.this.__clamp(z);
		for (var i = 254; i >= 0; --i) {
			r = (z[i >>> 3] >>> (i & 7)) & 1;
			this.__cswap(a, b, r);
			this.__cswap(c, d, r);
			this.__add(e, a, c);
			this.__subtract(a, a, c);
			this.__add(c, b, d);
			this.__subtract(b, b, d);
			this.__multmod(d, e, e);
			this.__multmod(f, a, a);
			this.__multmod(a, c, a);
			this.__multmod(c, b, e);
			this.__add(e, a, c);
			this.__subtract(a, a, c);
			this.__multmod(b, a, a);
			this.__subtract(c, d, f);
			this.__multmod(a, c, _121665);
			this.__add(a, a, d);
			this.__multmod(c, c, a);
			this.__multmod(a, d, f);
			this.__multmod(d, b, _9);
			this.__multmod(b, e, e);
			this.__cswap(a, b, r);
			this.__cswap(c, d, r);
		}
		this.__invert(c, c);
		this.__multmod(a, a, c);
		this.__pack(z, a);
		return z;
	}

	static generatePresharedKey() {
		var privateKey = new Uint8Array(32);
		crypto.getRandomValues(privateKey);
		return privateKey;
	}

	static generatePrivateKey() {
		var privateKey = new Uint8Array(32);
		crypto.getRandomValues(privateKey);
		this.__clamp(privateKey);
		return privateKey;
	}

	encodeBase64(dest, src) {
		var input = Uint8Array.from([(src[0] >> 2) & 63, ((src[0] << 4) | (src[1] >> 4)) & 63, ((src[1] << 2) | (src[2] >> 6)) & 63, src[2] & 63]);
		for (var i = 0; i < 4; ++i)
			dest[i] = input[i] + 65 +
			(((25 - input[i]) >> 8) & 6) -
			(((51 - input[i]) >> 8) & 75) -
			(((61 - input[i]) >> 8) & 15) +
			(((62 - input[i]) >> 8) & 3);
	}

	static keyToBase64(key) {
    function encodeBase64(dest, src) {
      var input = Uint8Array.from([(src[0] >> 2) & 63, ((src[0] << 4) | (src[1] >> 4)) & 63, ((src[1] << 2) | (src[2] >> 6)) & 63, src[2] & 63]);
      for (var i = 0; i < 4; ++i)
        dest[i] = input[i] + 65 +
        (((25 - input[i]) >> 8) & 6) -
        (((51 - input[i]) >> 8) & 75) -
        (((61 - input[i]) >> 8) & 15) +
        (((62 - input[i]) >> 8) & 3);
    }

		var i, base64 = new Uint8Array(44);
		for (i = 0; i < 32 / 3; ++i)
			encodeBase64(base64.subarray(i * 4), key.subarray(i * 3));
		encodeBase64(base64.subarray(i * 4), Uint8Array.from([key[i * 3 + 0], key[i * 3 + 1], 0]));
		base64[43] = 61;
		return String.fromCharCode.apply(null, base64);
	}

  static isValidIPv4(str) {
    const blocks = str.split('.');
    if (blocks.length !== 4) return false;

    for (let value of blocks) {
      value = parseInt(value, 10);
      if (Number.isNaN(value)) return false;
      if (value < 0 || value > 255) return false;
    }

    return true;
  }

  static promisify(fn) {
    // eslint-disable-next-line func-names
    return function(req, res) {
      Promise.resolve().then(async () => fn(req, res))
        .then((result) => {
          if (res.headersSent) return;

          if (typeof result === 'undefined') {
            return res
              .status(204)
              .end();
          }

          return res
            .status(200)
            .json(result);
        })
        .catch((error) => {
          if (typeof error === 'string') {
            error = new Error(error);
          }

          // eslint-disable-next-line no-console
          console.error(error);

          return res
            .status(error.statusCode || 500)
            .json({
              error: error.message || error.toString(),
              stack: error.stack,
            });
        });
    };
  }

  static async exec(cmd, {
    log = true,
  } = {}) {
    if (typeof log === 'string') {
      // eslint-disable-next-line no-console
      console.log(`$ ${log}`);
    } else if (log === true) {
      // eslint-disable-next-line no-console
      console.log(`$ ${cmd}`);
    }

    if (process.platform !== 'linux') {
      return '';
    }

    return new Promise((resolve, reject) => {
      childProcess.exec(cmd, {
        shell: 'bash',
      }, (err, stdout) => {
        if (err) return reject(err);
        return resolve(String(stdout).trim());
      });
    });
  }

};
