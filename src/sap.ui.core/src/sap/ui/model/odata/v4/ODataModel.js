/*!
 * ${copyright}
 */

//Provides class sap.ui.model.odata.v4.ODataModel

/**
 * Model and related classes like bindings for OData v4.
 *
 * @namespace
 * @name sap.ui.model.odata.v4
 * @public
 */

sap.ui.define([
	//FIX4MASTER open source approval for Olingo missing
	"jquery.sap.global",
	"sap/ui/model/Model",
	"./_ODataHelper",
	"./ODataContextBinding",
	"./ODataDocumentModel",
	"./ODataListBinding",
	"./ODataMetaModel",
	"./ODataPropertyBinding",
	"sap/ui/thirdparty/odatajs-4.0.0"
], function(jQuery, Model, Helper, ODataContextBinding, ODataDocumentModel, ODataListBinding,
		ODataMetaModel, ODataPropertyBinding, Olingo) {
	"use strict";

	/*global odatajs */

	var rListBindingPath = /^\/.+\[(\d+)\];list=(\d+)\/(.+)/;

	/**
	 * Returns an <code>Error</code> instance from an Olingo error response.
	 *
	 * @param {object} oError
	 *   an Olingo error response
	 * @returns {Error}
	 *   an <code>Error</code> instance
	 */
	function createError(oError) {
		return new Error(oError.message
			+ " - " + oError.response.statusCode + " " + oError.response.statusText
			+ ": " + oError.response.body);
	}

	/**
	 * Throws an error for a not yet implemented method with the given name called by the SAPUI5
	 * framework. The error message includes the arguments to the method call.
	 * @param {string} sMethodName - the method name
	 * @param {object} args - the arguments passed to this method when called by SAPUI5
	 */
	function notImplemented(sMethodName, args) {
		var sArgs;

		try {
			sArgs = JSON.stringify(args);
		} catch (e) {
			sArgs = "JSON.stringify error for arguments "  + String(args);
		}
		throw new Error("Not implemented method v4.ODataModel." + sMethodName
			+ " called with arguments " + sArgs);
	}

	/**
	 * Constructor for a new ODataModel.
	 *
	 * @param {string} [sServiceUrl]
	 *   root URL of the service to request data from; it is required, but may also be given via
	 *   <code>mParameters.serviceUrl</code>. Must end with a forward slash according to OData V4
	 *   specification ABNF, rule "serviceRoot".
	 * @param {object} [mParameters]
	 *   the parameters
	 * @param {string} [mParameters.serviceUrl]
	 *   root URL of the service to request data from; only used if the parameter
	 *   <code>sServiceUrl</code> has not been given
	 * @throws Error if the given service root URL does not end with a forward slash
	 *
	 * @class Model implementation for OData v4.
	 *
	 * @author SAP SE
	 * @alias sap.ui.model.odata.v4.ODataModel
	 * @extends sap.ui.model.Model
	 * @public
	 * @since 1.31.0
	 * @version ${version}
	 */
	var ODataModel = Model.extend("sap.ui.model.odata.v4.ODataModel",
			/** @lends sap.ui.model.odata.v4.ODataModel.prototype */
			{
				constructor : function (sServiceUrl, mParameters) {
					// do not pass any parameters to Model
					Model.apply(this);

					if (typeof sServiceUrl === "object") {
						mParameters = sServiceUrl;
						sServiceUrl = mParameters.serviceUrl;
					}
					if (!sServiceUrl) {
						throw new Error("Missing service root URL");
					}
					if (sServiceUrl.charAt(sServiceUrl.length - 1) !== "/") {
						throw new Error("Service root URL must end with '/'");
					}
					this.sServiceUrl = sServiceUrl;

					this.mHeaders = {
//						"Accept" : "application/json", //TODO odata.metadata=none?
						"Accept-Language" : sap.ui.getCore().getConfiguration().getLanguage(),
						"X-CSRF-Token" : "Fetch"
					};
					this.oMetaModel = new ODataMetaModel(
						new ODataDocumentModel(this.sServiceUrl + "$metadata"));
					this.mParameters = mParameters;
					this.oSecurityTokenPromise = null;
				}
			});

	/**
	 * Creates a new context binding for the given path. This binding is inactive and will not know
	 * the bound context initially. You have to call {@link sap.ui.model.Binding#initialize
	 * initialize()} to get it updated asynchronously and register a change listener at the binding
	 * to be informed when the bound context is available.
	 *
	 * @param {string} sPath
	 *   the binding path in the model
	 * @param {sap.ui.model.Context} [oContext]
	 *   the context which is required as base for a relative path
	 * @returns {sap.ui.model.odata.v4.ODataContextBinding}
	 *   the context binding
	 * @public
	 */
	ODataModel.prototype.bindContext = function (sPath, oContext) {
		return new ODataContextBinding(this, sPath, oContext);
	};

	/**
	 * Creates a new list binding for the given path and optional context which must
	 * resolve to an absolute OData path for an entity set.
	 *
	 * @param {string} sPath
	 *   the binding path in the model
	 * @param {sap.ui.model.Context} [oContext]
	 *   the context which is required as base for a relative path
	 * @param {sap.ui.model.Sorter[]} [aSorters]
	 *   initial sort order
	 * @param {sap.ui.model.Filter[]} [aFilters]
	 *   predefined filters
	 * @param {object} [mParameters]
	 *   map of parameters
	 * @param {string} [mParameters.$expand]
	 *   the "$expand" system query option used in each data service request for returned
	 *   list binding
	 * @return {sap.ui.model.odata.v4.ODataListBinding}
	 *   the list binding
	 * @public
	 */
	ODataModel.prototype.bindList = function (sPath, oContext, aSorters, aFilters, mParameters) {
		var oListBinding;

		this.aLists = this.aLists || [];
		oListBinding = new ODataListBinding(this, sPath, oContext, this.aLists.length, mParameters);
		this.aLists.push(oListBinding);
		return oListBinding;
	};

	/**
	 * Creates a new property binding for the given path. This binding is inactive and will not
	 * know the property value initially. You have to call {@link sap.ui.model.Binding#initialize
	 * initialize()} to get it updated asynchronously and register a change listener at the binding
	 * to be informed when the value is available.
	 *
	 * @param {string} sPath
	 *   the binding path in the model
	 * @param {sap.ui.model.Context} [oContext]
	 *   the context which is required as base for a relative path
	 * @returns {sap.ui.model.odata.v4.ODataPropertyBinding}
	 *   the property binding
	 * @public
	 */
	ODataModel.prototype.bindProperty = function (sPath, oContext) {
		return new ODataPropertyBinding(this, sPath, oContext);
	};

	ODataModel.prototype.bindTree = function () {
		notImplemented("bindTree", arguments);
	};

	/**
	 * Creates a new entity from the given data in the collection pointed to by the given path.
	 *
	 * @param {string} sPath
	 *   an absolute data binding path pointing to an entity set, e.g. "/EMPLOYEES"
	 * @param {object} oEntityData
	 *   the new entity's properties, e.g.
	 *   <code>{"ID" : "1", "AGE" : 52, "ENTRYDATE" : "1977-07-24", "Is_Manager" : false}</code>
	 * @param {boolean} [bIsFreshToken=false]
	 *   whether the CSRF has already been refreshed and thus should not be refreshed again
	 * @returns {Promise}
	 *   a promise which is resolved with the server's response data in case of success, or an
	 *   instance of <code>Error</code> in case of failure
	 *
	 * @private
	 */
	ODataModel.prototype.create = function (sPath, oEntityData, bIsFreshToken) {
		var that = this;

		if (sPath.charAt(0) !== "/") {
			throw new Error("Not an absolute data binding path: " + sPath);
		}

		return new Promise(function (fnResolve, fnReject) {
			odatajs.oData.request({
				data : oEntityData,
				headers : that.mHeaders,
				method : "POST",
				requestUri : that.sServiceUrl + sPath.slice(1)
			},
			function (oData, oResponse) {
				fnResolve(oData);
			},
			function (oError) {
				var sCsrfToken = Helper.headerValue("X-CSRF-Token", oError.response.headers);

				if (!bIsFreshToken && oError.response.statusCode === 403
					&& sCsrfToken && sCsrfToken.toLowerCase() === "required") {
					// refresh CSRF token and repeat original request
					that.refreshSecurityToken().then(function() {
						fnResolve(that.create(sPath, oEntityData, true));
					}, fnReject);
				} else {
					fnReject(createError(oError));
				}
			});
		});
	};

	ODataModel.prototype.createBindingContext = function () {
		notImplemented("createBindingContext", arguments);
	};

	ODataModel.prototype.destroyBindingContext = function () {
		notImplemented("destroyBindingContext", arguments);
	};

	/**
	 * Returns the meta model for this ODataModel
	 *
	 * @returns {sap.ui.model.odata.v4.ODataMetaModel}
	 *   The meta model for this ODataModel
	 * @public
	 */
	ODataModel.prototype.getMetaModel = function () {
		return this.oMetaModel;
	};

	ODataModel.prototype.getProperty = function () {
		notImplemented("getProperty", arguments);
	};

	/**
	 * Triggers a GET request to this model's OData service. The data will be stored in the model.
	 *
	 * @param {string} sPath
	 *   An absolute data binding path to the data which should be retrieved
	 * @param {boolean} [bAllowObjectAccess=false]
	 *   whether access to whole objects is allowed
	 * @returns {Promise}
	 *   A promise to be resolved when the OData request is finished
	 *
	 * @protected
	 */
	ODataModel.prototype.read = function (sPath, bAllowObjectAccess) {
		var that = this;

		if (sPath.charAt(0) !== "/") {
			throw new Error("Not an absolute data binding path: " + sPath);
		}

		return new Promise(function (fnResolve, fnReject) {
			var aMatches = rListBindingPath.exec(sPath), // /TEAMS[2];list=0/Name
				sRequestUri;

			if (aMatches) { // use list binding to retrieve the value
				that.aLists[Number(aMatches[2])]
					.readValue(Number(aMatches[1]), aMatches[3], bAllowObjectAccess)
					.then( function (oValue) {
							fnResolve({value : oValue});
						},
						function (oError) {
							fnReject(oError);
					});
				return;
			}

			sRequestUri = that.sServiceUrl + sPath.slice(1);
			odatajs.oData.read({
				requestUri: sRequestUri,
				headers: that.mHeaders
			}, function (oData, oResponse) {
				//TODO Olingo: oResponse.headers is actually an empty array misused as a map!
				that.mHeaders["X-CSRF-Token"]
					= Helper.headerValue("X-CSRF-Token", oResponse.headers)
					|| that.mHeaders["X-CSRF-Token"];
				fnResolve(oData);
			}, function (oError) {
				var oParsedError = JSON.parse(oError.response.body).error;
				jQuery.sap.log.error(oParsedError.message, "read(" + sRequestUri + ")",
					"sap.ui.model.odata.v4.ODataModel");
				oError = new Error(oParsedError.message);
				oError.error = oParsedError;
				fnReject(oError);
			});
		});
	};

	/**
	 * Returns a promise that will be resolved once the CSRF token has been refreshed, or rejected
	 * if that fails. Makes sure that only one HEAD request is underway at any given time and
	 * shares the promise accordingly.
	 *
	 * @returns {Promise}
	 *   A promise that will be resolved (with no result) once the CSRF token has been refreshed;
	 *   it also has an <code>abort</code> property which provides access to the HEAD request's
	 *   <code>abort</code> function.
	 *
	 * @private
	 */
	ODataModel.prototype.refreshSecurityToken = function () {
		var fnAbort,
			that = this;

		if (!this.oSecurityTokenPromise) {
			this.oSecurityTokenPromise = new Promise(function (fnResolve, fnReject) {
				fnAbort = odatajs.oData.read({
						requestUri: that.sServiceUrl,
						method: "HEAD",
						headers : {
							"X-CSRF-Token" : "Fetch"
						}
					}, function (oData, oResponse) {
						that.mHeaders["X-CSRF-Token"]
							= Helper.headerValue("X-CSRF-Token", oResponse.headers);
						that.oSecurityTokenPromise = null;
						fnResolve();
					}, function (oError) {
						that.oSecurityTokenPromise = null;
						fnReject(createError(oError));
					}).abort;
			});
			this.oSecurityTokenPromise.abort = fnAbort;
		}

		return this.oSecurityTokenPromise;
	};

	/**
	 * Requests the object for the given path relative to the given context.
	 *
	 * If the path does not contain a <code>/#</code>, path and context are used to get the object
	 * from the data model.
	 * If the path contains <code>/#</code>, it will be split into a data model path and a meta
	 * model path.
	 * For example:
	 * /path/in/data/model/#path/in/metadata/model
	 * For the given context and data model path, the corresponding meta model context is
	 * determined. This context is used to retrieve the meta model object following the meta model
	 * path.
	 *
	 * Returns a <code>Promise</code>, which is resolved with the requested object or rejected with
	 * an error.
	 *
	 * @param {string} sPath
	 *   A relative or absolute path within the model
	 * @param {sap.ui.model.Context} [oContext]
	 *   The context in the data model to be used as a starting point in case of a relative path
	 * @returns {Promise}
	 *   A promise which is resolved with the requested object as soon as it is available
	 * @public
	 */
	ODataModel.prototype.requestObject = function (sPath, oContext) {
		var iMeta = sPath.indexOf('/#'),
			sMetaModelPath,
			sModelPath,
			that = this;

		if (iMeta >= 0) {
			sModelPath = this.resolve(sPath.substring(0, iMeta), oContext);
			sMetaModelPath = sPath.substring(iMeta + 2);
			return this.getMetaModel().requestMetaContext(sModelPath)
				.then(function (oMetaContext) {
					return that.getMetaModel().requestObject(sMetaModelPath, oMetaContext);
				});
		}
		notImplemented("requestObject", arguments);
	};

	return ODataModel;

}, /* bExport= */ true);
