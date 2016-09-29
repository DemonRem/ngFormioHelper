angular.module('ngFormBuilderHelper')
.constant('FormSubmissionController', [
  '$scope',
  '$stateParams',
  '$state',
  'Formio',
  'FormioAlerts',
  function (
    $scope,
    $stateParams,
    $state,
    Formio,
    FormioAlerts
  ) {
    $scope.token = Formio.getToken();
    $scope.submissionId = $stateParams.subId;
    $scope.submissionUrl = $scope.formUrl;
    $scope.submissionUrl += $stateParams.subId ? ('/submission/' + $stateParams.subId) : '';
    $scope.submissionData = Formio.submissionData;
    $scope.submission = {};

    // Load the submission.
    if ($scope.submissionId) {
      $scope.formio = new Formio($scope.submissionUrl);
      $scope.formio.loadSubmission().then(function(submission) {
        $scope.submission = submission;
      });
    }

    $scope.$on('formSubmission', function(event, submission) {
      event.stopPropagation();
      var message = (submission.method === 'put') ? 'updated' : 'created';
      FormioAlerts.addAlert({
        type: 'success',
        message: 'Submission was ' + message + '.'
      });
      $state.go('form.submission.index', {formId: $scope.formId});
    });

    $scope.$on('delete', function(event) {
      event.stopPropagation();
      FormioAlerts.addAlert({
        type: 'success',
        message: 'Submission was deleted.'
      });
      $state.go('form.submission.index');
    });

    $scope.$on('cancel', function(event) {
      event.stopPropagation();
      $state.go('form.submission.item.view');
    });

    $scope.$on('formError', function(event, error) {
      event.stopPropagation();
      FormioAlerts.onError(error);
    });

    $scope.$on('rowView', function (event, submission) {
      $state.go('form.submission.item.view', {
        subId: submission._id
      });
    });

    $scope.$on('submissionView', function(event, submission) {
      $state.go('form.submission.item.view', {
        subId: submission._id
      });
    });

    $scope.$on('submissionEdit', function(event, submission) {
      $state.go('form.submission.item.edit', {
        subId: submission._id
      });
    });

    $scope.$on('submissionDelete', function(event, submission) {
      $state.go('form.submission.item.delete', {
        subId: submission._id
      });
    });
  }
]);