/*global describe,it,takeScreenshot,browser,expect*/

describe("sap.m.ToggleButton_Standalone_Visual", function() {
	"use strict";

	browser.testrunner.currentSuite.meta.controlName = 'sap.m.ToggleButton';

	it("Initial state - Cozy mode, Belize ToggleButtons", function() {
		expect(takeScreenshot()).toLookAs("initialState_cozy_Belize_ToggleButtons");
	});

});