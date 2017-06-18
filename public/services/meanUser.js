'use strict';

angular.module('mean.users').factory('MeanUser', ['$rootScope', '$http', '$location', '$stateParams', '$state',
  '$cookies', '$q', '$timeout', '$meanConfig', 'Global', 'RestApi', 'EncoderDataUtil',
  function ($rootScope, $http, $location, $stateParams, $state, $cookies, $q, $timeout, $meanConfig, Global, RestApi, EncoderDataUtil) {

    var self;

    function escape(html) {
      return String(html)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function b64_to_utf8(str) {
      return decodeURIComponent(escape(window.atob(str)));
    }

    /*function url_base64_decode(str) {
      var output = str.replace('-', '+').replace('_', '/');
      switch (output.length % 4) {
      case 0:
      break;
      case 2:
      output += '==';
      break;
      case 3:
      output += '=';
      break;
      default:
      throw 'Illegal base64url string!';
      }
      return window.atob(output); //polifyll https://github.com/davidchambers/Base64.js
    }*/

    function MeanUserKlass() {
      this.name = 'users';
      this.user = {};
      this.acl = {};
      this.registerForm = false;
      this.loggedin = false;
      this.isAdmin = false;
      this.loginError = 0;
      this.usernameError = null;
      this.registerError = null;
      this.resetpassworderror = null;
      this.validationError = null;
      self = this;
      $http.get('/api/users/me').then(function (response) {
        if (!response.data && $cookies.get('token') && $cookies.get('redirect')) {
          self.onIdentity.bind(self)({
            token: $cookies.get('token'),
            redirect: $cookies.get('redirect').replace(/^"|"$/g, '')
          });
          $cookies.remove('token');
          $cookies.remove('redirect');
        } else {
          self.onIdentity.bind(self)(response.data);
        }
      });
    }

    MeanUserKlass.prototype.onIdentity = function (response) {

      if (!response) return;

      // Workaround for Angular 1.6.x
      if (response.data)
        response = response.data;

      var encodedUser, user, destination;
      if (angular.isDefined(response.token)) {
        localStorage.setItem('JWT', response.token);
        encodedUser = decodeURI(b64_to_utf8(response.token.split('.')[1]));
        user = JSON.parse(encodedUser);
      }
      destination = angular.isDefined(response.redirect) ? response.redirect : destination;
      this.user = user || response;
      this.loggedin = true;
      this.loginError = 0;
      this.registerError = 0;
      this.isAdmin = this.user.roles.indexOf('admin') > -1;
      var userObj = this.user;
      var self = this;
      // Add circles info to user
      $http.get('/api/circles/mine').then(function (response) {
        self.acl = response.data;
        if (destination) {
          $location.path(destination);
        }
        $rootScope.$emit('loggedin', userObj);
        Global.authenticate(userObj);
      });
    };

    MeanUserKlass.prototype.onIdFail = function (response) {

      // Workaround for Angular 1.6.x
      if (response.data)
        response = response.data;

      $location.path(response.redirect);
      this.loginError = 'Erro na autenticação.';
      this.registerError = response;
      this.validationError = response.msg;
      this.resetpassworderror = response.msg;
      $rootScope.$emit('loginfailed');
      $rootScope.$emit('registerfailed');
    };

    var MeanUser = new MeanUserKlass();

    MeanUserKlass.prototype.login = function (user) {
      var destination = $location.path().indexOf('/login') === -1 ? $location.absUrl() : false;
      $http.post('/api/login', {
        email: user.email,
        password: user.password,
        redirect: destination
      })
        .then(this.onIdentity.bind(this))
        .catch(this.onIdFail.bind(this));
    };

    MeanUserKlass.prototype.register = function (user) {
      RestApi.getRequestServerIsAvailable()
        .then(function (response) {
          $http.post('/api/register', {
            email: user.email,
            password: user.password,
            confirmPassword: user.confirmPassword,
            username: user.username,
            name: user.name,
            legalIdentifier: user.legalIdentifier,
            stateRegistration: user.stateRegistration,
            birthday: user.birthday,
            phone: user.phone
          })
            .then(function (success) {
              var encodedUser = decodeURI(b64_to_utf8(success.data.token.split('.')[1]));
              var responseUser = JSON.parse(encodedUser);
              var userData = {
                "dueDay": 1,
                "holder": {
                  "email": responseUser.email,
                  "legalIdentifier": responseUser.legalIdentifier,
                  "name": responseUser.name,
                  "stateRegistration": responseUser.stateRegistration
                },
                "clientId": responseUser._id,
                "status": "ACTIVE"
              };
              RestApi.postRequest(EncoderDataUtil.encodeURIToBase64("api/bill-accounts"), EncoderDataUtil.encodeDataToBase64(userData))
                .then(function (response) {
                  MeanUser.onIdentity(success);
                })
                .catch(function (response) {
                  MeanUser.delete(responseUser._id)
                    .then(function (response) {
                      MeanUser.onIdFail(response);
                    })
                    .catch(function (err) {
                      MeanUser.onIdFail(err);
                    });
                });
            })
            .catch(function (err) {
              MeanUser.onIdFail(err);
            });
        })
        .catch(function (response) {
          $location.path('/');
        });
    };

    MeanUserKlass.prototype.update = function (user) {
      RestApi.getRequestServerIsAvailable()
        .then(function (response) {
          var client;
          RestApi.getRequest(EncoderDataUtil.encodeURIToBase64("api/bill-client-accounts/" + user._id))
            .then(function (response) {
              client = response.data;

              $http.put('/api/update', {
                email: user.email,
                username: user.username,
                name: user.name,
                legalIdentifier: user.legalIdentifier,
                stateRegistration: user.stateRegistration,
                birthday: user.birthday,
                phone: user.phone
              })
                .then(function (success) {
                  var encodedUser = decodeURI(b64_to_utf8(success.data.token.split('.')[1]));
                  var responseUser = JSON.parse(encodedUser);
                  var userData = {
                    "dueDay": 1,
                    "holder": {
                      "email": responseUser.email,
                      "name": responseUser.name,
                      "stateRegistration": responseUser.stateRegistration
                    },
                    "id": client.id,
                    "status": "ACTIVE"
                  };
                  RestApi.putRequest(EncoderDataUtil.encodeURIToBase64("api/bill-accounts"), EncoderDataUtil.encodeDataToBase64(userData))
                    .then(function (response) {
                      MeanUser.onIdentity(success);
                    })
                    .catch(function (response) {
                    });
                })
                .catch(function (err) {
                  MeanUser.onIdFail(err);
                });

            })
            .catch(function (response) {
            });

        })
        .catch(function (response) {
          $location.path('/');
        });
    };

    MeanUserKlass.prototype.changepassword = function (user) {
      $http.post('/api/change', {
        password: user.password,
        confirmPassword: user.confirmPassword
      })
        .then(this.onIdentity.bind(this))
        .catch(this.onIdFail.bind(this));
    };

    MeanUserKlass.prototype.resetpassword = function (user) {
      RestApi.getRequestServerIsAvailable()
        .then(function (response) {
          $http.post('/api/reset/' + $stateParams.tokenId, {
            password: user.password,
            confirmPassword: user.confirmPassword
          })
            .then(this.onIdentity.bind(this))
            .catch(this.onIdFail.bind(this));
        })
        .catch(function (response) {
          $location.path('/');
        });

    };

    MeanUserKlass.prototype.forgotpassword = function (user) {
      $http.post('/api/forgot-password', {
        text: user.email
      })
        .then(function (response) {
          $rootScope.$emit('forgotmailsent', response.data);
        })
        .catch(this.onIdFail.bind(this));
    };

    MeanUserKlass.prototype.logout = function () {
      this.user = {};
      this.loggedin = false;
      this.isAdmin = false;

      $http.get('/api/logout').then(function (response) {
        localStorage.removeItem('JWT');
        $rootScope.$emit('logout');
        Global.authenticate();
      });
    };

    MeanUserKlass.prototype.checkLoggedin = function () {
      var deferred = $q.defer();

      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').then(function (response) {
        var user = response.data;
        // Authenticated
        if (user !== '0') $timeout(deferred.resolve);

        // Not Authenticated
        else {
          $cookies.put('redirect', $state.go('auth.login'));
          $timeout(deferred.reject);
          $state.go('auth.login');
        }
      });

      return deferred.promise;
    };

    MeanUserKlass.prototype.checkLoggedOut = function () {
      // Check if the user is not connected
      // Initialize a new promise
      var deferred = $q.defer();

      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').then(function (response) {
        var user = response.data;
        // Authenticated
        if (user !== '0') {
          $timeout(deferred.reject);
          $location.url('/');
        }
        // Not Authenticated
        else $timeout(deferred.resolve);
      });

      return deferred.promise;
    };

    MeanUserKlass.prototype.checkAdmin = function () {
      var deferred = $q.defer();

      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').then(function (response) {
        var user = response.data;
        // Authenticated
        if (user !== '0' && user.roles.indexOf('admin') !== -1) $timeout(deferred.resolve);

        // Not Authenticated or not Admin
        else {
          $timeout(deferred.reject);
          $location.url('/');
        }
      });

      return deferred.promise;
    };

    MeanUserKlass.prototype.delete = function (userId) {
      $http.post('/api/delete', {
        id: userId
      })
        .then(this.onIdentity.bind(this))
        .catch(this.onIdFail.bind(this));
    };

    return MeanUser;
  }
]);
