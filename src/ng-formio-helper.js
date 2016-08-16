var fs = require('fs');
angular.module('ngFormioHelper', ['formio', 'ngFormioGrid', 'ui.router'])
  .filter('capitalize', [function () {
    return _.capitalize;
  }])
  .filter('truncate', [function () {
    return function (input, opts) {
      if (_.isNumber(opts)) {
        opts = {length: opts};
      }
      return _.truncate(input, opts);
    };
  }])
  .directive("fileread", [
    function () {
      return {
        scope: {
          fileread: "="
        },
        link: function (scope, element) {
          element.bind("change", function (changeEvent) {
            var reader = new FileReader();
            reader.onloadend = function (loadEvent) {
              scope.$apply(function () {
                scope.fileread = jQuery(loadEvent.target.result);
              });
            };
            reader.readAsText(changeEvent.target.files[0]);
          });
        }
      };
    }
  ])
  .provider('FormioResource', [
    '$stateProvider',
    function ($stateProvider) {
      var resources = {};
      return {
        register: function (name, url, options) {
          options = options || {};
          resources[name] = options.title || name;
          var parent = (options && options.parent) ? options.parent : null;
          var parents = (options && options.parents) ? options.parents : [];
          if ((!parents || !parents.length) && parent) {
            parents = [parent];
          }
          var queryId = name + 'Id';
          options.base = options.base || '';
          var baseName = options.base + name;
          var query = function (submission) {
            var query = {};
            query[queryId] = submission._id;
            return query;
          };

          // Allow them to alter the options per state.
          var baseAlter = function (options) {
            return options;
          };
          options.alter = angular.extend({
            index: baseAlter,
            create: baseAlter,
            abstract: baseAlter,
            view: baseAlter,
            edit: baseAlter,
            delete: baseAlter
          }, options.alter);

          var templates = (options && options.templates) ? options.templates : {};
          var controllers = (options && options.controllers) ? options.controllers : {};
          var queryParams = options.query ? options.query : '';
          $stateProvider
            .state(baseName + 'Index', options.alter.index({
              url: '/' + name + queryParams,
              params: options.params && options.params.index,
              templateUrl: templates.index ? templates.index : 'formio-helper/resource/index.html',
              controller: [
                '$scope',
                '$state',
                '$stateParams',
                '$controller',
                function (
                  $scope,
                  $state,
                  $stateParams,
                  $controller
                ) {
                  $scope.baseName = baseName;
                  var gridQuery = {};
                  if (parents.length) {
                    parents.forEach(function(parent) {
                      if ($stateParams.hasOwnProperty(parent + 'Id')) {
                        gridQuery['data.' + parent + '._id'] = $stateParams[parent + 'Id'];
                      }
                    });
                  }
                  $scope.currentResource = {
                    name: name,
                    queryId: queryId,
                    formUrl: url,
                    columns: [],
                    gridQuery: gridQuery,
                    gridOptions: {}
                  };
                  $scope.$on('rowView', function (event, submission) {
                    $state.go(baseName + '.view', query(submission));
                  });
                  $scope.$on('submissionView', function (event, submission) {
                    $state.go(baseName + '.view', query(submission));
                  });

                  $scope.$on('submissionEdit', function (event, submission) {
                    $state.go(baseName + '.edit', query(submission));
                  });

                  $scope.$on('submissionDelete', function (event, submission) {
                    $state.go(baseName + '.delete', query(submission));
                  });
                  if (controllers.index) {
                    $controller(controllers.index, {$scope: $scope});
                  }
                }
              ]
            }))
            .state(baseName + 'Create', options.alter.create({
              url: '/create/' + name + queryParams,
              params: options.params && options.params.create,
              templateUrl: templates.create ? templates.create : 'formio-helper/resource/create.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  $scope.baseName = baseName;
                  $scope.currentResource = {
                    name: name,
                    queryId: queryId,
                    formUrl: url
                  };
                  $scope.submission = options.defaultValue ? options.defaultValue : {data: {}};
                  $scope.pageTitle = 'New ' + _.capitalize(name);
                  var handle = false;
                  if (controllers.create) {
                    var ctrl = $controller(controllers.create, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (parents.length) {
                    if (!$scope.hideComponents) {
                      $scope.hideComponents = [];
                    }
                    $scope.hideComponents = $scope.hideComponents.concat(parents);

                    // Auto populate the parent entity with the new data.
                    parents.forEach(function(parent) {
                      $scope[parent].loadSubmissionPromise.then(function (entity) {
                        $scope.submission.data[parent] = entity;
                      });
                    });
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function (event, submission) {
                      $scope.currentResource.resource = submission;
                      $state.go(baseName + '.view', query(submission));
                    });
                  }
                }
              ]
            }))
            .state(baseName, options.alter.abstract({
              abstract: true,
              url: '/' + name + '/:' + queryId,
              templateUrl: templates.abstract ? templates.abstract : 'formio-helper/resource/resource.html',
              controller: [
                '$scope',
                '$stateParams',
                'Formio',
                '$controller',
                '$http',
                function ($scope,
                          $stateParams,
                          Formio,
                          $controller,
                          $http) {
                  var submissionUrl = url;
                  var endpoint = options.endpoint;
                  if (endpoint) {
                    endpoint += '/' + $stateParams[queryId];
                  }
                  else {
                    submissionUrl += '/submission/' + $stateParams[queryId];
                  }

                  $scope.baseName = baseName;
                  $scope.currentResource = $scope[name] = {
                    name: name,
                    queryId: queryId,
                    formUrl: url,
                    submissionUrl: submissionUrl,
                    formio: (new Formio(submissionUrl)),
                    resource: {},
                    form: {},
                    href: '/#/' + name + '/' + $stateParams[queryId] + '/',
                    parent: (parents.length === 1) ? $scope[parents[0]] : {href: '/#/', name: 'home'}
                  };

                  $scope.currentResource.loadFormPromise = $scope.currentResource.formio.loadForm().then(function (form) {
                    $scope.currentResource.form = $scope[name].form = form;
                    return form;
                  });

                  // If they provide their own endpoint for data.
                  if (options.endpoint) {
                    $scope.currentResource.loadSubmissionPromise = $http.get(endpoint, {
                      headers: {
                        'x-jwt-token': Formio.getToken()
                      }
                    }).then(function (result) {
                      $scope.currentResource.resource = result.data;
                      return result.data;
                    });
                  }
                  else {
                    $scope.currentResource.loadSubmissionPromise = $scope.currentResource.formio.loadSubmission().then(function (submission) {
                      $scope.currentResource.resource = $scope[name].submission = submission;
                      return submission;
                    });
                  }

                  if (controllers.abstract) {
                    $controller(controllers.abstract, {$scope: $scope});
                  }
                }
              ]
            }))
            .state(baseName + '.view', options.alter.view({
              url: '/',
              params: options.params && options.params.view,
              templateUrl: templates.view ? templates.view : 'formio-helper/resource/view.html',
              controller: [
                '$scope',
                '$controller',
                function ($scope,
                          $controller) {
                  if (controllers.view) {
                    $controller(controllers.view, {$scope: $scope});
                  }
                }
              ]
            }))
            .state(baseName + '.edit', options.alter.edit({
              url: '/edit',
              params: options.params && options.params.edit,
              templateUrl: templates.edit ? templates.edit : 'formio-helper/resource/edit.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  if (parents.length) {
                    if (!$scope.hideComponents) {
                      $scope.hideComponents = [];
                    }
                    $scope.hideComponents = $scope.hideComponents.concat(parents);
                  }
                  if (controllers.edit) {
                    var ctrl = $controller(controllers.edit, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function (event, submission) {
                      $scope.currentResource.resource = submission;
                      $state.go(baseName + '.view', query(submission));
                    });
                  }
                }
              ]
            }))
            .state(baseName + '.delete', options.alter.delete({
              url: '/delete',
              params: options.params && options.params.delete,
              templateUrl: templates.delete ? templates.delete : 'formio-helper/resource/delete.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  $scope.resourceName = name;
                  if (controllers.delete) {
                    var ctrl = $controller(controllers.delete, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('delete', function () {
                      if ((parents.length === 1) && parents[0] !== 'home') {
                        $state.go(parents[0] + '.view');
                      }
                      else {
                        $state.go('home', null, {reload: true});
                      }
                    });
                    $scope.$on('cancel', function () {
                      $state.go(baseName + 'Index');
                    });
                  }
                }
              ]
            }));
        },
        $get: function () {
          return resources;
        }
      };
    }
  ])
  .directive('formioForms', function () {
    return {
      restrict: 'E',
      replace: true,
      scope: {
        src: '=',
        base: '=',
        tag: '=?'
      },
      templateUrl: 'formio-helper/form/list.html',
      controller: ['$scope', 'Formio', function ($scope, Formio) {
        $scope.forms = [];
        var params = {
          type: 'form',
          limit: 9999999
        };
        var loadForms = function () {
          if (!$scope.src) {
            return;
          }
          if ($scope.tag) {
            params.tags = $scope.tag;
          }
          (new Formio($scope.src)).loadForms({params: params}).then(function (forms) {
            $scope.forms = forms;
          });
        };

        $scope.$watch('src', loadForms);
      }]
    };
  })
  .provider('FormioForms', [
    '$stateProvider',
    function ($stateProvider) {
      var resources = {};
      return {
        register: function (name, url, options) {
          options = options || {};
          var templates = options.templates ? options.templates : {};
          var controllers = options.controllers ? options.controllers : {};
          var fields = (typeof options.field === 'string') ? [options.field] : options.field;

          // Normalize the fields properties.
          fields = _.map(fields, function(field) {
            if (typeof field === 'string') {
              return {
                name: field,
                stateParam: field + 'Id'
              };
            }
            return field;
          });
          var basePath = options.base ? options.base : '';
          if (!basePath) {
            basePath = name ? name + '.' : '';
          }

          $stateProvider
            .state(basePath + 'formIndex', {
              url: '/forms',
              params: options.params && options.params.index,
              templateUrl: templates.index ? templates.index : 'formio-helper/form/index.html',
              controller: ['$scope', 'Formio', '$controller', function ($scope, Formio, $controller) {
                $scope.formBase = basePath;
                $scope.formsSrc = url + '/form';
                $scope.formsTag = $scope.formsTag || options.tag;
                if (controllers.index) {
                  $controller(controllers.index, {$scope: $scope});
                }
              }]
            })
            .state(basePath + 'form', {
              url: '/form/:formId',
              abstract: true,
              templateUrl: templates.form ? templates.form : 'formio-helper/form/form.html',
              controller: [
                '$scope',
                '$stateParams',
                'Formio',
                '$controller',
                function ($scope,
                          $stateParams,
                          Formio,
                          $controller) {
                  var formUrl = url + '/form/' + $stateParams.formId;
                  $scope.formBase = basePath;
                  $scope.currentForm = {
                    name: name,
                    url: formUrl,
                    form: {}
                  };

                  $scope.currentForm.formio = (new Formio(formUrl));
                  $scope.currentForm.promise = $scope.currentForm.formio.loadForm().then(function (form) {
                    $scope.currentForm.form = form;
                    return form;
                  });

                  if (controllers.form) {
                    $controller(controllers.form, {$scope: $scope});
                  }
                }
              ]
            })
            .state(basePath + 'form.view', {
              url: '/',
              params: options.params && options.params.view,
              templateUrl: templates.view ? templates.view : 'formio-helper/form/view.html',
              controller: [
                '$scope',
                '$state',
                'FormioUtils',
                '$controller',
                function ($scope,
                          $state,
                          FormioUtils,
                          $controller) {
                  $scope.submission = {data: {}};
                  var handle = false;
                  if (fields && fields.length) {
                    $scope.hideComponents = _.map(fields, function(field) {
                      return field.name;
                    });
                    $scope.currentForm.promise.then(function () {
                      fields.forEach(function (field) {
                        var parts = field.name.split('.');
                        var fieldName = parts[parts.length - 1];
                        $scope[fieldName].loadSubmissionPromise.then(function (resource) {
                          _.set($scope.submission.data, field.name, resource);
                        });
                      });
                    });
                  }
                  if (controllers.view) {
                    var ctrl = $controller(controllers.view, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function () {
                      $state.go(basePath + 'form.submissions');
                    });
                  }
                }
              ]
            })
            .state(basePath + 'form.submissions', {
              url: '/submissions',
              params: options.params && options.params.submissions,
              templateUrl: templates.submissions ? templates.submissions : 'formio-helper/submission/index.html',
              controller: [
                '$scope',
                '$state',
                '$stateParams',
                'FormioUtils',
                '$controller',
                function ($scope,
                          $state,
                          $stateParams,
                          FormioUtils,
                          $controller) {
                  $scope.submissionQuery = {};
                  $scope.submissionColumns = [];
                  if (fields && fields.length) {
                    fields.forEach(function (field) {
                      $scope.submissionQuery['data.' + field.name + '._id'] = $stateParams[field.stateParam];
                    });
                  }

                  // Go to the submission when they click on the row.
                  $scope.$on('rowView', function (event, entity) {
                    $state.go(basePath + 'form.submission.view', {
                      formId: entity.form,
                      submissionId: entity._id
                    });
                  });

                  if (controllers.submissions) {
                    $controller(controllers.submissions, {$scope: $scope});
                  }

                  $scope.currentForm.promise.then(function (form) {
                    localStorage.setItem(form.name, '');
                    if (
                      !$scope.submissionColumns.length &&
                      !Object.keys($scope.submissionColumns).length === 0
                    ) {
                      FormioUtils.eachComponent(form.components, function (component) {
                        if (!component.key || !component.input || !component.tableView) {
                          return;
                        }
                        if (fields && fields.length && !_.find(fields, {name: component.key})) {
                          return;
                        }
                        $scope.submissionColumns.push(component.key);
                      });

                      // Ensure we reload the data grid.
                      $scope.$broadcast('reloadGrid');
                    }
                  });
                }
              ]
            })
            .state(basePath + 'form.submission', {
              abstract: true,
              url: '/submission/:submissionId',
              params: options.params && options.params.submission,
              templateUrl: templates.submission ? templates.submission : 'formio-helper/submission/submission.html',
              controller: [
                '$scope',
                '$stateParams',
                'Formio',
                '$controller',
                function ($scope,
                          $stateParams,
                          Formio,
                          $controller) {
                  $scope.currentSubmission = {
                    url: $scope.currentForm.url + '/submission/' + $stateParams.submissionId,
                    submission: {
                      data: {}
                    }
                  };

                  // Store the formio object.
                  $scope.currentSubmission.formio = (new Formio($scope.currentSubmission.url));

                  // Load the current submission.
                  $scope.currentSubmission.promise = $scope.currentSubmission.formio.loadSubmission().then(function (submission) {
                    $scope.currentSubmission.submission = submission;
                    return submission;
                  });

                  // Execute the controller.
                  if (controllers.submission) {
                    $controller(controllers.submission, {$scope: $scope});
                  }
                }
              ]
            })
            .state(basePath + 'form.submission.view', {
              url: '/',
              params: options.params && options.params.submissionView,
              templateUrl: templates.submissionView ? templates.submissionView : 'formio-helper/submission/view.html',
              controller: [
                '$scope',
                '$controller',
                function ($scope,
                          $controller) {
                  if (controllers.submissionView) {
                    $controller(controllers.submissionView, {$scope: $scope});
                  }
                }
              ]
            })
            .state(basePath + 'form.submission.edit', {
              url: '/edit',
              params: options.params && options.params.submissionEdit,
              templateUrl: templates.submissionEdit ? templates.submissionEdit : 'formio-helper/submission/edit.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  if (controllers.submissionEdit) {
                    var ctrl = $controller(controllers.submissionEdit, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('formSubmission', function (event, submission) {
                      $scope.currentSubmission.submission = submission;
                      $state.go(basePath + 'form.submission.view');
                    });
                  }
                }
              ]
            })
            .state(basePath + 'form.submission.delete', {
              url: '/delete',
              params: options.params && options.params.submissionDelete,
              templateUrl: templates.submissionDelete ? templates.submissionDelete : 'formio-helper/submission/delete.html',
              controller: [
                '$scope',
                '$state',
                '$controller',
                function ($scope,
                          $state,
                          $controller) {
                  var handle = false;
                  if (controllers.submissionDelete) {
                    var ctrl = $controller(controllers.submissionDelete, {$scope: $scope});
                    handle = (ctrl.handle || false);
                  }
                  if (!handle) {
                    $scope.$on('delete', function () {
                      $state.go(basePath + 'form.submissions');
                    });

                    $scope.$on('cancel', function () {
                      $state.go(basePath + 'form.submission.view');
                    });
                  }
                }
              ]
            })
        },
        $get: function () {
          return resources;
        }
      };
    }
  ])
  .directive('offlineButton', function () {
    return {
      restrict: 'E',
      replace: true,
      scope: false,
      controller: [
        '$scope', '$rootScope', function($scope, $rootScope) {
          $scope.offline = $rootScope.offline;
          $scope.hasOfflineMode = $rootScope.hasOfflineMode;
        }
      ],
      templateUrl: 'formio-helper/offline/button.html'
    };
  })
  .directive('offlinePopup', function () {
    return {
      restrict: 'A',
      scope: false,
      link: function (scope, el) {
        if (typeof jQuery === 'undefined') {
          return;
        }
        jQuery(el).popover();
      }
    };
  })
  .provider('FormioOffline', [
    '$stateProvider',
    function ($stateProvider) {
      return {
        register: function (options) {
          options = options || {};
          $stateProvider.state('offline', {
            url: options.errorUrl || '/offline/error',
            templateUrl: 'formio-helper/offline/index.html',
            params: {
              currentSubmission: {}
            },
            controller: [
              '$scope',
              '$stateParams',
              '$rootScope',
              '$state',
              function(
                $scope,
                $stateParams,
                $rootScope,
                $state
              ) {
                if (typeof FormioOfflineProject === 'undefined') {
                  return;
                }
                $scope.currentSubmission = $stateParams.currentSubmission;
                $scope.submitSubmission = function() {
                  $rootScope.offline.dequeueSubmissions();
                  $state.go(options.homeState || 'home');
                }
                $scope.cancelSubmission = function() {
                  $rootScope.offline.skipNextQueuedSubmission();
                  $rootScope.offline.dequeueSubmissions();
                }
              }
            ]
          });
        },
        $get: [
          'Formio',
          'FormioAlerts',
          '$rootScope',
          'AppConfig',
          '$window',
          '$state',
          function (
            Formio,
            FormioAlerts,
            $rootScope,
            AppConfig,
            $window,
            $state
          ) {
            return {
              init: function () {
                if (typeof FormioOfflineProject === 'undefined') {
                  console.log('setting off');
                  $rootScope.hasOfflineMode = false;
                  return;
                }
                console.log('setting on');
                $rootScope.hasOfflineMode = true;
                $rootScope.appVersion = AppConfig.appVersion;
                $rootScope.offline = new FormioOfflineProject(AppConfig.appUrl, 'project.json');
                Formio.registerPlugin($rootScope.offline, 'offline');
                $rootScope.offline.onError = function(err) {
                  FormioAlerts.addAlert({
                    type: 'danger',
                    message: 'Failed to save offline cache. This could result in missing data.'
                  });
                };

                Formio.events.on('offline.formError', function(error, submission) {
                  FormioAlerts.addAlert({
                    message: error,
                    type: 'danger'
                  })
                  // We should check for authentication errors and redirect to login if unauthenticated and error.
                  $state.go('offline', {currentSubmission: submission});
                });

                // This section monitors for new application versions and will prompt to reload the page. Checks every minute on
                // state change.
                var appCache = $window.applicationCache;
                var checkUpdate = _.debounce(function() {
                  appCache.update();
                }, 60*1000);
                // Check for appcache updates and alert the user if available.
                if (appCache) {
                  appCache.addEventListener('updateready', function() {
                    if (appCache.status == appCache.UPDATEREADY) {
                      // Browser downloaded a new app cache.
                      if (confirm('A new version of the application is available. Would you like to load it?')) {
                        // Swap it in and reload the page to get the latest hotness.
                        appCache.swapCache();
                        $window.location.reload();
                      }
                    }
                    else {
                      // Manifest didn't changed. Don't do anything.
                    }
                  }, false);
                  $rootScope.$on('$stateChangeStart', function() {
                    if (appCache.status !== appCache.UNCACHED && appCache.status !== appCache.OBSOLETE) {
                      checkUpdate();
                    }
                  });
                }
              }
            };
          }
        ]
      };
    }
  ])
  .provider('FormioAuth', [
    '$stateProvider',
    'FormioProvider',
    function ($stateProvider, FormioProvider) {
      var init = false;
      var anonState = 'auth.login';
      var anonRole = false;
      var authState = 'home';
      var allowedStates = [];
      var registered = false;
      // These are needed to check permissions against specific forms.
      var formAccess = {};
      var roles = {};
      return {
        setForceAuth: function (allowed) {
          if (typeof allowed === 'boolean') {
            allowedStates = allowed ? ['auth'] : [];
          }
          else {
            allowedStates = allowed;
          }
        },
        setStates: function (anon, auth) {
          anonState = anon;
          authState = auth;
        },
        setAnonRole: function(role) {
          anonRole = role;
        },
        setAppUrl: function(url) {
          FormioProvider.setAppUrl(url);
        },
        register: function (name, resource, path, form, override) {
          var noOverride = form && !override;
          if (!registered) {
            registered = true;
            $stateProvider.state('auth', {
              abstract: true,
              url: '/auth',
              templateUrl: noOverride ? 'formio-helper/auth/auth.html' : 'views/user/auth.html'
            });
          }

          if (!path) {
            path = name;
          }
          var tpl = name.toLowerCase() + '.html';
          $stateProvider
            .state('auth.' + name, {
              url: '/' + path,
              parent: 'auth',
              templateUrl: noOverride ? 'formio-helper/auth/' + tpl : 'views/user/' + tpl,
              controller: ['$scope', '$state', '$rootScope', function ($scope, $state, $rootScope) {
                $scope.currentForm = form;
                $scope.$on('formSubmission', function (err, submission) {
                  if (!submission) {
                    return;
                  }
                  $rootScope.setUser(submission, resource);
                  $state.go(authState);
                });
              }]
            })
        },
        $get: [
          'Formio',
          'FormioAlerts',
          '$rootScope',
          '$state',
          '$stateParams',
          '$http',
          '$q',
          function (
            Formio,
            FormioAlerts,
            $rootScope,
            $state,
            $stateParams,
            $http,
            $q
          ) {
            return {
              init: function () {
                init = true;

                // Get the access for this project.
                $rootScope.accessPromise = Formio.makeStaticRequest(Formio.getAppUrl() + '/access').then(function(access) {
                  angular.forEach(access.forms, function(form) {
                    formAccess[form.name] = {};
                    form.submissionAccess.forEach(function(access) {
                      formAccess[form.name][access.type] = access.roles;
                    });
                  });
                  roles = access.roles;
                  return access;
                }, function(err) {
                  roles = {};
                  return null;
                });

                $rootScope.user = null;
                $rootScope.isReady = false;
                $rootScope.userPromise = Formio.currentUser().then(function (user) {
                  $rootScope.setUser(user, localStorage.getItem('formioRole'));
                  return user;
                });

                // Return if the user has a specific role.
                $rootScope.hasRole = function(roleName) {
                  roleName = roleName.toLowerCase();
                  if (!$rootScope.user) {
                    return (roleName === 'anonymous');
                  }
                  if (roles[roleName]) {
                    return $rootScope.user.roles.indexOf(roles[roleName]._id) !== -1;
                  }
                  return false;
                };
                $rootScope.ifRole = function(roleName) {
                  return $rootScope.whenReady.then(function() {
                    return $rootScope.isAdmin || $rootScope.hasRole(roleName);
                  });
                };

                // Assign the roles to the user.
                $rootScope.assignRoles = function() {
                  if (!roles) {
                    $rootScope.isAdmin = false;
                    return false;
                  }
                  for (var roleName in roles) {
                    if (roles[roleName].admin) {
                      $rootScope['is' + roles[roleName].title.replace(/\s/g, '')] = $rootScope.isAdmin = $rootScope.hasRole(roleName);
                      if ($rootScope.isAdmin) {
                        break;
                      }
                    }
                  }
                  for (var roleName in roles) {
                    if (!roles[roleName].admin) {
                      $rootScope['is' + roles[roleName].title.replace(/\s/g, '')] = $rootScope.hasRole(roleName);
                    }
                  }
                };

                // Create a promise that loads when everything is ready.
                $rootScope.whenReady = $rootScope.accessPromise.then($rootScope.userPromise).then(function() {
                  $rootScope.isReady = true;
                  $rootScope.assignRoles();
                  return true;
                });

                // @todo - Deprecate this call...
                $rootScope.isRole = function (role) {
                  return $rootScope.role === role.toLowerCase();
                };

                $rootScope.setUser = function (user, role) {
                  if (user) {
                    $rootScope.user = user;
                    localStorage.setItem('formioAppUser', angular.toJson(user));
                  }
                  else {
                    $rootScope.user = null;
                    localStorage.removeItem('formioAppUser');
                    Formio.clearCache();
                    Formio.setUser(null);
                  }

                  if (!role) {
                    $rootScope.role = null;
                    localStorage.removeItem('formioAppRole');
                  }
                  else {
                    $rootScope.role = role.toLowerCase();
                    localStorage.setItem('formioAppRole', role);
                  }
                  $rootScope.authenticated = !!Formio.getToken();
                  $rootScope.assignRoles();
                  $rootScope.$emit('user', {
                    user: $rootScope.user,
                    role: $rootScope.role
                  });
                };

                $rootScope.hasAccess = function(form, permissions) {
                  // Bypass if using an alternative Auth system.
                  if (!init) {
                    return true;
                  }

                  // Allow single permission or array of permissions.
                  if (!Array.isArray(permissions)) {
                    permissions = [permissions];
                  }

                  // Check that the formAccess has been initialized.
                  if (!formAccess[form]) {
                    return false;
                  }

                  var hasAccess = false;
                  permissions.forEach(function(permission) {
                    // Check that there are permissions.
                    if (!formAccess[form][permission]) {
                      return false;
                    }
                    // Check for anonymous users. Must set anonRole.
                    if (!$rootScope.user) {
                      if (formAccess[form][permission].indexOf(anonRole) !== -1) {
                        hasAccess = true;
                      }
                    }
                    else {
                      // Check the user's roles for access.
                      $rootScope.user.roles.forEach(function(role) {
                        if (formAccess[form][permission].indexOf(role) !== -1) {
                          hasAccess = true;
                        }
                      });
                    }
                  });
                  return hasAccess;
                };
                $rootScope.ifAccess = function(form, permissions) {
                  return $rootScope.whenReady.then(function() {
                    return $rootScope.hasAccess(form, permissions);
                  });
                };

                var logoutError = function () {
                  $rootScope.setUser(null, null);
                  localStorage.removeItem('formioToken');
                  $state.go(anonState, $stateParams, {
                    reload: true,
                    inherit: false,
                    notify: true
                  });
                  FormioAlerts.addAlert({
                    type: 'danger',
                    message: 'Your session has expired. Please log in again.'
                  });
                };

                $rootScope.$on('formio.sessionExpired', logoutError);
                Formio.events.on('formio.badToken', logoutError);
                Formio.events.on('formio.sessionExpired', logoutError);

                // Trigger when a logout occurs.
                $rootScope.logout = function () {
                  $rootScope.setUser(null, null);
                  localStorage.removeItem('formioToken');
                  Formio.logout().then(function () {
                    $state.go(anonState, $stateParams, {
                      reload: true,
                      inherit: false,
                      notify: true
                    });
                  }).catch(logoutError);
                };

                // Ensure they are logged.
                $rootScope.$on('$stateChangeStart', function (event, toState) {
                  $rootScope.authenticated = !!Formio.getToken();
                  if ($rootScope.authenticated) {
                    return;
                  }
                  if (allowedStates.length) {
                    var allowed = false;
                    for (var i in allowedStates) {
                      if (toState.name.indexOf(allowedStates[i]) === 0) {
                        allowed = true;
                        break;
                      }
                    }

                    if (allowed) {
                      return;
                    }

                    event.preventDefault();
                    $state.go(anonState, {}, {reload: true});
                  }
                });

                // Set the alerts
                $rootScope.$on('$stateChangeSuccess', function () {
                  $rootScope.alerts = FormioAlerts.getAlerts();
                });
              }
            };
          }
        ]
      };
    }
  ])
  .factory('FormioAlerts', [
    '$rootScope',
    function ($rootScope) {
      var alerts = [];
      return {
        addAlert: function (alert) {
          $rootScope.alerts.push(alert);
          if (alert.element) {
            angular.element('#form-group-' + alert.element).addClass('has-error');
          }
          else {
            alerts.push(alert);
          }
        },
        getAlerts: function () {
          var tempAlerts = angular.copy(alerts);
          alerts.length = 0;
          alerts = [];
          return tempAlerts;
        },
        onError: function showError(error) {
          if (error.message) {
            this.addAlert({
              type: 'danger',
              message: error.message,
              element: error.path
            });
          }
          else {
            var errors = error.hasOwnProperty('errors') ? error.errors : error.data.errors;
            angular.forEach(errors, showError.bind(this));
          }
        }
      };
    }
  ])
  .run([
    '$templateCache',
    '$rootScope',
    '$state',
    function ($templateCache,
              $rootScope,
              $state) {
      // Determine the active state.
      $rootScope.isActive = function (state) {
        return $state.current.name.indexOf(state) !== -1;
      };

      /**** AUTH TEMPLATES ****/
      $templateCache.put('formio-helper/auth/auth.html',
        fs.readFileSync(__dirname + '/templates/auth/auth.html', 'utf8')
      );

      $templateCache.put('formio-helper/auth/login.html',
        fs.readFileSync(__dirname + '/templates/auth/login.html', 'utf8')
      );

      $templateCache.put('formio-helper/auth/register.html',
        fs.readFileSync(__dirname + '/templates/auth/register.html', 'utf8')
      );

      /**** RESOURCE TEMPLATES *******/
      $templateCache.put('formio-helper/resource/resource.html',
        fs.readFileSync(__dirname + '/templates/resource/resource.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/create.html',
        fs.readFileSync(__dirname + '/templates/resource/create.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/delete.html',
        fs.readFileSync(__dirname + '/templates/resource/delete.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/edit.html',
        fs.readFileSync(__dirname + '/templates/resource/edit.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/index.html',
        fs.readFileSync(__dirname + '/templates/resource/index.html', 'utf8')
      );

      $templateCache.put('formio-helper/resource/view.html',
        fs.readFileSync(__dirname + '/templates/resource/view.html', 'utf8')
      );

      /**** FORM TEMPLATES *******/
      $templateCache.put('formio-helper/form/list.html',
        fs.readFileSync(__dirname + '/templates/form/list.html', 'utf8')
      );

      $templateCache.put('formio-helper/form/index.html',
        fs.readFileSync(__dirname + '/templates/form/index.html', 'utf8')
      );

      $templateCache.put('formio-helper/form/form.html',
        fs.readFileSync(__dirname + '/templates/form/form.html', 'utf8')
      );

      $templateCache.put('formio-helper/form/view.html',
        fs.readFileSync(__dirname + '/templates/form/view.html', 'utf8')
      );

      /**** SUBMISSION TEMPLATES *******/
      $templateCache.put('formio-helper/submission/index.html',
        fs.readFileSync(__dirname + '/templates/submission/index.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/submission.html',
        fs.readFileSync(__dirname + '/templates/submission/submission.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/view.html',
        fs.readFileSync(__dirname + '/templates/submission/view.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/edit.html',
        fs.readFileSync(__dirname + '/templates/submission/edit.html', 'utf8')
      );

      $templateCache.put('formio-helper/submission/delete.html',
        fs.readFileSync(__dirname + '/templates/submission/delete.html', 'utf8')
      );

      /**** OFFLINE TEMPLATES ****/
      $templateCache.put('formio-helper/offline/index.html',
        fs.readFileSync(__dirname + '/templates/offline/index.html', 'utf8')
      );

      $templateCache.put('formio-helper/offline/button.html',
        fs.readFileSync(__dirname + '/templates/offline/button.html', 'utf8')
      );
    }
  ]);