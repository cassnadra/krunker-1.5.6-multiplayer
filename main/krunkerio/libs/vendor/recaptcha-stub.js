// Stands in for Google's reCAPTCHA script (www.google.com/recaptcha/api.js?onload=captchaCallback), served by
// main.js. The game only starts connecting once that script has loaded and called captchaCallback, so without it
// (offline, or Google unreachable) it would wait forever. Our server doesn't use captchas.
window.grecaptcha = { render: function () { return 0 }, execute: function () { }, reset: function () { } }
setTimeout(function () { window.captchaCallback && window.captchaCallback() }, 0)
