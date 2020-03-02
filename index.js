const getOptions = require('./utils/getOptions');
const { RPClient, EVENTS } = require('reportportal-client');
const { getClientInitObject, getSuiteStartObject,
        getStartLaunchObject, getTestStartObject } = require('./utils/objectUtils');

const testItemStatuses = { PASSED: 'passed', FAILED: 'failed', SKIPPED: 'pending' };
const logLevels = {
    ERROR: 'error',
    TRACE: 'trace',
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn'
};

const promiseErrorHandler = promise => {
    promise.catch(err => {
        console.error(err);
    });
};


class JestReportPortal {
    constructor (globalConfig, options) {
        this.globalConfig = globalConfig;
        this.reportOptions = getClientInitObject(getOptions.options(options));
        this.client = new RPClient(this.reportOptions);
        this.tempSuiteId = null;
        this.tempTestId = null;
        this._registerListeners();
    }

    // eslint-disable-next-line no-unused-vars
    onRunStart (aggregatedResults, options) {
        const startLaunchObj = getStartLaunchObject(this.reportOptions);
        let { tempId, promise } = this.client.startLaunch(startLaunchObj);

        this.tempLaunchId = tempId;
        promiseErrorHandler(promise);
    }

    // eslint-disable-next-line no-unused-vars
    onTestResult (test, testResult, aggregatedResults) {
        console.log('onTestResult', test);
        let suiteName = testResult.testResults[0].ancestorTitles[0];

        this._startSuite(suiteName);
        testResult.testResults.forEach(t => {
            for (let i = 0; i < t.invocations; i++) {
                const isRetried = t.invocations !== 1;

                this._startTest(t.title, isRetried);
                this._finishTest(t, isRetried);
            }
        });

        this._finishSuite();
    }

    // eslint-disable-next-line no-unused-vars
    onRunComplete (contexts, results) {
        console.log('onRunComplete', contexts);
        const { promise } = this.client.finishLaunch(this.tempLaunchId);

        promiseErrorHandler(promise);
    }

    _startSuite (suiteName) {
        const { tempId, promise } = this.client.startTestItem(getSuiteStartObject(suiteName),
            this.tempLaunchId);

        promiseErrorHandler(promise);
        this.tempSuiteId = tempId;
    }

    _startTest (testName, isRetried) {
        const testStartObj = getTestStartObject(testName, isRetried);
        const { tempId, promise } = this.client.startTestItem(testStartObj, this.tempLaunchId, this.tempSuiteId);

        promiseErrorHandler(promise);
        this.tempTestId = tempId;
    }

    _finishTest (test, isRetried) {
        //console.log('_finishTest', test);
        let errorMsg = test.failureMessages[0];

        switch (test.status) {
            case testItemStatuses.PASSED:
                this._finishPassedTest(isRetried);
                break;
            case testItemStatuses.FAILED:
                this._finishFailedTest(errorMsg, isRetried);
                break;
            case testItemStatuses.SKIPPED:
                this._finishSkippedTest(isRetried);
                break;
            default:
                // eslint-disable-next-line no-console
                console.log('Unsupported test Status!!!');
        }
    }

    _finishPassedTest (isRetried) {
        const status = testItemStatuses.PASSED;
        const finishTestObj = Object.assign({ status }, { retry: isRetried });
        const { promise } = this.client.finishTestItem(this.tempTestId, finishTestObj);

        promiseErrorHandler(promise);
    }

    _finishFailedTest (failureMessage, isRetried) {
        const status = testItemStatuses.FAILED;
        const finishTestObj = Object.assign({ status }, { retry: isRetried });

        this._sendLog(failureMessage);

        const { promise } = this.client.finishTestItem(this.tempTestId, finishTestObj);

        promiseErrorHandler(promise);
    }

    _sendLog (message) {
        let logObject = {
            message: message,
            level: logLevels.ERROR
        };
        const { promise } = this.client.sendLog(this.tempTestId, logObject);

        promiseErrorHandler(promise);
    }

    _finishSkippedTest (isRetried) {
        const status = 'skipped';
        const finishTestObj = Object.assign({ status }, { retry: isRetried });
        const { promise } = this.client.finishTestItem(this.tempTestId, finishTestObj);

        promiseErrorHandler(promise);
    }

    _finishSuite () {
        const { promise } = this.client.finishTestItem(this.tempSuiteId, {});

        promiseErrorHandler(promise);
    }

    _registerListeners () {
        console.log('_registerListeners');
        process.on(EVENTS.ADD_ATTRIBUTES, this.onRunComplete.bind(this));
    }
}

module.exports = JestReportPortal;
