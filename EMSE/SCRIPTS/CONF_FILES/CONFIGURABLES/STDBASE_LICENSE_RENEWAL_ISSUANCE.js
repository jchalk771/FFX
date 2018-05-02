/*==========================================================================================
 Title : STDBASE_LICENSE_RENEWAL_ISSUANCE

 Purpose : Updates renewal record parent status, LPs, expiration dates, with ability to copy components

 Author: Osama Matkari

 Functional Area :

 Description : JSON must contain :	
 
 
 {
  "Marijuana/Retail/Retail Store/Renewal": {
    "WorkflowTaskUpdateAfter": [		//event to run 
      {
        "metadata": {
          "description": "Updates renewal record parent status, LPs, expiration dates, with ability to copy components",
          "operators": {
          }
        },
        "criteria": {
          "task": ["task1"],		//WfTask to run when matched (if -for ex- event is WFTUA)
          "status": ["status-a"]	//WfStatus to run when matched (if -for ex- event is WFTUA)
        },
        "preScript": "",			//Custom script to run prior to configurable script
        "action": {
          "issuedRecordStatus": "Issued",	//Record Status of the license
          "issuedExpirationStatus": "Active",	//Expiration Status of the license
          "issuedLPStatus": "A",	//Status of LP associated to the License
          "expirationType": "Days",	//Expiration - Supports "Expiration Code" configuration or specific # of Days for Expiration
          "expirationPeriod": "1000",	// No of days for expiration code Days
          "customExpirationFunction": "",	// Array of components to be copied from the Renewal record to the License record, in the event of changes
          "copyComponents": [
            "Contacts",
            "Custom Fields",
            "Custom Lists"
          ]
        },
        "postScript": ""	//Custom script to run after configurable script
      }
    ]
  }
}

 Reviewed By: 

 Script Type : (EMSE, EB, Pageflow, Batch): EMSE

 General Purpose/Client Specific : General

 Client developed for : 

 Parameters:
	 itemCap - capIdObject
	 recordSettings - JSON rule
 ================================================================================================================*/
var scriptSuffix = "LICENSE_RENEWAL_ISSUANCE";
// CONF_{SOLUTION}_LICENSE_RENEWAL_ISSUANCE
// {SOLUTION} = AS DEFINED IN THE "SOLUTION MAPPING" STANDARD CHOICE

try {
	// This should be included in all Configurable Scripts
	eval(getScriptText("CONFIGURABLE_SCRIPTS_COMMON"));

	// This should be included in all Configurable Scripts
	var settingsArray = [];
	if (isConfigurableScript(settingsArray, scriptSuffix)) {
		for (s in settingsArray) {

			var rules = settingsArray[s];

			// Execute PreScript
			var preScript = handleUndefined(rules.preScript);
			if (!matches(preScript, null, "")) {
				eval(getScriptText(preScript));
			}
			if (cancelCfgExecution) {
				logDebug("**WARN STDBASE Script [" + scriptSuffix + "] canceled by cancelCfgExecution");
				cancelCfgExecution = false;
				continue;
			}

			// Execute licenseRenewalIssuance
			licenseRenewalIssuance(capId, rules);

			// Execute Post Script
			var postScript = handleUndefined(rules.postScript);
			if (!matches(postScript, null, "")) {
				eval(getScriptText(postScript));
			}
		}
	}

} catch (ex) {
	logDebug("**ERROR:Exception while verifying the rules for " + scriptSuffix + ". Error: " + ex);
}

/**
 * Standard base script for License Renewal Issuance
 * 
 * @param {CapIdObject}
 *            itemCapId
 * @param {Array}
 *            recordSettings
 */
function licenseRenewalIssuance(itemCapId, recordSettings) {
	var functionTitle = "licenseRenewalIssuance()";
	//var debugMode = true;

	// Rules
	var issuedRecordStatus = handleUndefined(recordSettings.action.issuedRecordStatus, false);
	var issuedExpirationStatus = handleUndefined(recordSettings.action.issuedExpirationStatus, false);
	var issuedLPStatus = handleUndefined(recordSettings.action.issuedLPStatus, false);
	var expirationType = handleUndefined(recordSettings.action.expirationType, false);
	var copyComponents = recordSettings.action.copyComponents; // Array

	//	logDebug("issuedRecordStatus: " + issuedRecordStatus);
	//	logDebug("issuedExpirationStatus: " + issuedExpirationStatus);
	//	logDebug("issuedLPStatus: " + issuedLPStatus);
	//	logDebug("expirationType: " + expirationType);
	//	logDebug("copyComponents: " + copyComponents.join(', '));

	var parentCapId = getRenewalParentCapID(itemCapId); // This is renewal cap
	// parent

	if (parentCapId) {
		var parentCapIdStr = parentCapId.getCustomID();
		logDebug("Parent cap: " + parentCapIdStr);

		if (issuedRecordStatus != null && issuedRecordStatus != "") {
			updateAppStatus(issuedRecordStatus, "", parentCapId);
		}

		// Expiration
		var rB1ExpResult = aa.expiration.getLicensesByCapID(parentCapId).getOutput();
		if (issuedExpirationStatus != null && issuedExpirationStatus != "") {
			rB1ExpResult.setExpStatus(issuedExpirationStatus);
		}
		if (expirationType != null && expirationType != "") {
			// Get Next Expiration Date if using Expiration Code
			if (expirationType == "Expiration Code") {
				var rExpBiz = aa.proxyInvoker.newInstance("com.accela.aa.license.expiration.ExpirationBusiness").getOutput();
				var rB1Model = rB1ExpResult.getB1Expiration();
				var rNextDate = rExpBiz.getNextExpDate(rB1Model);
				rB1ExpResult.setExpDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
			}

			if (expirationType == "Days" && recordSettings.action.expirationPeriod != null && recordSettings.action.expirationPeriod != "") {
				rB1ExpResult.setExpDate(aa.date.parseDate(dateAdd(aa.util.now(), recordSettings.action.expirationPeriod)));
			}
			if (expirationType == "Function" && recordSettings.action.customExpirationFunction != null && recordSettings.action.customExpirationFunction != "") {
				var dateCalculationFuntion = recordSettings.action.customExpirationFunction + "( rB1ExpResult )";
				var dateResult = eval("(" + dateCalculationFuntion + ")");
				if (dateResult instanceof Date) {
					rB1ExpResult.setExpDate(aa.date.parseDate(dateAdd(dateResult, 0)));
				} else {
					logDebug("WARNING: Custom Function return values are not accepted as date");
				}

			}
		}
		aa.expiration.editB1Expiration(rB1ExpResult.getB1Expiration());
		// ------------------------------------------------------------------

		// LP Expiration
		var LPs = aa.licenseScript.getLicenseProf(parentCapId);
		if (LPs.getSuccess()) {
			var LPsArr = LPs.getOutput();
			if (LPsArr && LPsArr.length > 0) {
				for (i in LPsArr) {
					var rThisLP = getRefLicenseProf(LPsArr[i].getLicenseNbr());
					if (rThisLP) {
						if (expirationType != null && expirationType != "") {
							if (expirationType == "Expiration Code") {
								var rExpBiz = aa.proxyInvoker.newInstance("com.accela.aa.license.expiration.ExpirationBusiness").getOutput();
								var rB1Model = rB1ExpResult.getB1Expiration();
								var rNextDate = rExpBiz.getNextExpDate(rB1Model);
								rThisLP.setLicenseExpirationDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
							}

							if (expirationType == "Days" && recordSettings.action.expirationPeriod) {
								rThisLP.setLicenseExpirationDate(aa.date.parseDate(dateAdd(aa.util.now(), recordSettings.action.expirationPeriod)));
							}
							if (expirationType == "Function" && recordSettings.action.customExpirationFunction != null && recordSettings.action.customExpirationFunction != "") {
								var dateCalculationFuntion = recordSettings.action.customExpirationFunction + "( rThisLP )";
								var dateResult = eval("(" + dateCalculationFuntion + ")");
								if (dateResult instanceof Date) {
									rThisLP.setLicenseExpirationDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
								} else {
									logDebug("WARNING: Custom Function return values are not accepted as date");
								}
							}
						}

						if (issuedLPStatus != null && issuedLPStatus != "") {
							rThisLP.setAuditStatus(issuedLPStatus);
						}
						var editRefResult = aa.licenseScript.editRefLicenseProf(rThisLP);
					}
				}
			}

		}
		// ------------------------------------------------------------------

		if (copyComponents && copyComponents.length > 0) {
			for (i in copyComponents) {
				if (copyComponents[i] == "Contacts") {
					copyContacts(itemCapId, parentCapId);
				}
				if (copyComponents[i] == "Custom Fields") {
					// copyASIFields(itemCapId, parentCapId);
					copyAppSpecific(parentCapId);
				}
				if (copyComponents[i] == "Custom Lists") {
					copyASITables(itemCapId, parentCapId);
				}
			}
		}
	}
}

// Will return false if parent doesn't exists...
function getRenewalParentCapID(capId) {
	var parentLic = getParentLicenseCapID(capId);
	var pLicArray = String(parentLic).split("-");
	if (pLicArray && aa.cap.getCapID(pLicArray[0], pLicArray[1], pLicArray[2]).getSuccess()) {
		var parentLicenseCAPID = aa.cap.getCapID(pLicArray[0], pLicArray[1], pLicArray[2]).getOutput();
		return parentLicenseCAPID;
	} else {
		return false;
	}
}
