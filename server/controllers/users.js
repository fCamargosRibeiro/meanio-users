'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    User = mongoose.model('User'),
    async = require('async'),
    config = require('meanio').loadConfig(),
    crypto = require('crypto'),
    nodemailer = require('nodemailer'),
    templates = require('../template'),
    _ = require('lodash'),
    jwt = require('jsonwebtoken'); //https://npmjs.org/package/node-jsonwebtoken



/**
 * Send reset password email
 */
function sendMail(mailOptions) {
    var transport = nodemailer.createTransport(config.mailer);
    transport.sendMail(mailOptions, function (err, response) {
        if (err) return err;
        return response;
    });
}



module.exports = function (MeanUser) {
    return {
        /**
         * Auth callback
         */
        authCallback: function (req, res) {
            var payload = req.user;
            var escaped = JSON.stringify(payload);
            escaped = encodeURI(escaped);
            // We are sending the payload inside the token
            var token = jwt.sign(escaped, config.secret);
            res.cookie('token', token);
            var destination = config.strategies.landingPage;
            if (!req.cookies.redirect)
                res.cookie('redirect', destination);
            res.redirect(destination);
        },

        /**
         * Show login form
         */
        signin: function (req, res) {
            if (req.isAuthenticated()) {
                return res.redirect('/');
            }
            res.redirect('/login');
        },

        /**
         * Logout
         */
        signout: function (req, res) {

            MeanUser.events.publish({
                action: 'logged_out',
                user: {
                    name: req.user.name
                }
            });

            req.logout();
            res.redirect('/');
        },

        /**
         * Session
         */
        session: function (req, res) {
            res.redirect('/');
        },

        /**
         * Create user
         */
        create: function (req, res, next) {
            var user = new User(req.body);

            user.provider = 'local';

            // because we set our user.provider to local our models/user.js validation will always be true
            req.assert('name', 'Você deve informar um nome').notEmpty();
            req.assert('email', 'Você deve informar um e-mail válido').isEmail();
            req.assert('password', 'Senha deve ter entre 8-20 caracteres').len(8, 20);
            req.assert('username', 'Você deve informar um Apelido com 1 a 20 caracteres').len(1, 20);
            req.assert('confirmPassword', 'Senhas não são iguais').equals(req.body.password);
            req.assert('legalIdentifier', 'Você deve informar um CPF ou CNPJ válido').notEmpty();
            req.assert('birthday', 'Você deve informar uma data de nascimento').notEmpty();
            req.assert('phone', 'Você deve informar um telefone').notEmpty();

            var errors = req.validationErrors();
            if (errors) {
                return res.status(400).send(errors);
            }

            // Hard coded for now. Will address this with the user permissions system in v0.3.5
            user.roles = ['authenticated'];
            user.save(function (err) {
                if (err) {
                    switch (err.code) {
                        case 11000:
                        case 11001:
                            res.status(400).json([{
                                msg: 'Apelido já está sendo usado por outro usuário',
                                param: 'username'
                            }]);
                            break;
                        default:
                            var modelErrors = [];

                            if (err.errors) {

                                for (var x in err.errors) {
                                    modelErrors.push({
                                        param: x,
                                        msg: err.errors[x].message,
                                        value: err.errors[x].value
                                    });
                                }

                                res.status(400).json(modelErrors);
                            }
                    }
                    return res.status(400);
                }

                var payload = user;
                payload.redirect = req.body.redirect;
                var escaped = JSON.stringify(payload);
                escaped = encodeURI(escaped);
                req.logIn(user, function (err) {
                    if (err) { return next(err); }

                    MeanUser.events.publish({
                        action: 'created',
                        user: {
                            name: req.user.name,
                            username: user.username,
                            email: user.email
                        }
                    });

                    // We are sending the payload inside the token
                    var token = jwt.sign(escaped, config.secret);
                    res.json({
                        token: token,
                        redirect: config.strategies.landingPage
                    });
                });
                res.status(200);
            });
        },
        update: function (req, res, next) {

            // because we set our user.provider to local our models/user.js validation will always be true
            req.assert('name', 'Você deve informar um nome').notEmpty();
            req.assert('email', 'Você deve informar um e-mail válido').isEmail();
            req.assert('username', 'Apelido não pode ter mais de 20 caracteres').len(1, 20);
            req.assert('legalIdentifier', 'Você deve informar um CPF ou CNPJ válido').notEmpty();
            req.assert('birthday', 'Você deve informar uma data de nascimento').notEmpty();
            req.assert('phone', 'Você deve informar um telefone').notEmpty();

            var errors = req.validationErrors();
            if (errors) {
                return res.status(400).send(errors);
            }

            var user = req.user;
            _.extend(user, req.body);
            user.save(function (err) {
                if (err) {
                    switch (err.code) {
                        case 11000:
                        case 11001:
                            res.status(400).json([{
                                msg: 'Apelido já está em uso por outro usuário',
                                param: 'username'
                            }]);
                            break;
                        default:
                            var modelErrors = [];

                            if (err.errors) {

                                for (var x in err.errors) {
                                    modelErrors.push({
                                        param: x,
                                        msg: err.errors[x].message,
                                        value: err.errors[x].value
                                    });
                                }

                                res.status(400).json(modelErrors);
                            }
                    }
                    return res.status(400);
                }

                var payload = user;
                payload.redirect = req.body.redirect;
                var escaped = JSON.stringify(payload);
                escaped = encodeURI(escaped);
                var token = jwt.sign(escaped, config.secret);
                res.status(200).json({
                    token: token,
                    redirect: config.strategies.landingPage
                });
            });


        },
        loggedin: function (req, res) {
            if (!req.isAuthenticated()) return res.send('0');
            User.findById(req.user._id)
                .exec(function (err, user) {
                    if (err) return next(err);
                    res.send(user ? user : '0');
                })
        },
        /**
         * Send User
         */
        me: function (req, res) {
            if (!req.user) return res.send(null);

            if (!req.refreshJWT) {
                return res.json(req.user);
            } else {
                var payload = req.user;
                var escaped = JSON.stringify(payload);
                escaped = encodeURI(escaped);
                var token = jwt.sign(escaped, config.secret);
                res.json({ token: token });
            }
        },

        /**
         * Find user by id
         */
        user: function (req, res, next, id) {
            User.findOne({
                _id: id
            }).exec(function (err, user) {
                if (err) return next(err);
                if (!user) return next(new Error('Falha ao carregar o Usuário ' + id));
                req.profile = user;
                next();
            });
        },
        /**
       * Loads a user into the request
       */
        loadUser: function (req, res, next) {
            if (!req.isAuthenticated()) {
                return next();
            }

            req.refreshJWT = false;

            User.findOne({
                _id: req.user._id
            }, function (err, user) {
                if (err || !user) {
                    delete req.user;
                } else {
                    var dbUser = user.toJSON();
                    var id = req.user._id;

                    delete dbUser._id;
                    delete req.user._id;

                    var eq = _.isEqual(dbUser, req.user);
                    if (!eq) {
                        req.refreshJWT = true;
                    }
                    req.user = user;
                }
                return next();
            });
        },

        changepassword: function (req, res, next) {
            var user = req.user;
            req.assert('password', 'Senha deve ter entre 8-20 caracteres').len(8, 20);
            req.assert('confirmPassword', 'Senhas não são iguais').equals(req.body.password);
            var errors = req.validationErrors();
            if (errors) {
                return res.status(400).send(errors);
            }
            user.password = req.body.password;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            user.save(function (err) {

                MeanUser.events.publish({
                    action: 'change_password',
                    user: {
                        name: user.name
                    }
                });

                var payload = user;
                payload.redirect = req.body.redirect;
                var escaped = JSON.stringify(payload);
                escaped = encodeURI(escaped);
                var token = jwt.sign(escaped, config.secret);
                res.status(200).json({
                    token: token,
                    redirect: config.strategies.landingPage
                });
            });
        },

        /**
         * Resets the password
         */

        resetpassword: function (req, res, next) {
            User.findOne({
                resetPasswordToken: req.params.token,
                resetPasswordExpires: {
                    $gt: Date.now()
                }
            }, function (err, user) {
                if (err) {
                    return res.status(400).json({
                        msg: err
                    });
                }
                if (!user) {
                    return res.status(400).json({
                        msg: 'Link inválido ou expirado'
                    });
                }
                req.assert('password', 'Senha deve ter entre 8-20 caracteres').len(8, 20);
                req.assert('confirmPassword', 'Senhas não são iguais').equals(req.body.password);
                var errors = req.validationErrors();
                if (errors) {
                    return res.status(400).send(errors);
                }
                user.password = req.body.password;
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;
                user.save(function (err) {

                    MeanUser.events.publish({
                        action: 'reset_password',
                        user: {
                            name: user.name
                        }
                    });

                    req.logIn(user, function (err) {
                        if (err) return next(err);
                        return res.send({
                            user: user
                        });
                    });
                });
            });
        },

        /**
         * Callback for forgot password link
         */
        forgotpassword: function (req, res, next) {
            async.waterfall([

                function (done) {
                    crypto.randomBytes(20, function (err, buf) {
                        var token = buf.toString('hex');
                        done(err, token);
                    });
                },
                function (token, done) {
                    User.findOne({
                        $or: [{
                            email: req.body.text
                        }, {
                            username: req.body.text
                        }]
                    }, function (err, user) {
                        if (err || !user) return done(true);
                        done(err, user, token);
                    });
                },
                function (user, token, done) {
                    user.resetPasswordToken = token;
                    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
                    user.save(function (err) {
                        done(err, token, user);
                    });
                },
                function (token, user, done) {
                    var mailOptions = {
                        to: user.email,
                        from: config.emailFrom
                    };
                    mailOptions = templates.forgot_password_email(user, req, token, mailOptions);
                    sendMail(mailOptions);
                    done(null, user);
                }
            ],
                function (err, user) {

                    var response = {
                        message: 'E-mail enviado com sucesso',
                        status: 'success'
                    };
                    if (err) {
                        response.message = 'Usuário não existe';
                        response.status = 'danger';

                    }
                    MeanUser.events.publish({
                        action: 'forgot_password',
                        user: {
                            name: req.body.text
                        }
                    });
                    res.json(response);
                });
        }
    };
}

