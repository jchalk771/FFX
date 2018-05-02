/*

Title : Copy Record Data Automation (After)
Purpose : Copy data between parent and child records
Author: Yazan Barghouth

Functional Area :

JSON Example : 
{
  "Marijuana/Combo/Testing Facility/Application": {
    "WorkflowTaskUpdateAfter": [
      {
        "metadata": {
          "description": "Copy data between parent and child records",
          "operators": {
            "status":"!="
          }
        },
        "preScript": "",
        "criteria": {
          "task": [
            "Inspections"
          ],
          "status": [
            "Denied"
          ],
          "recordType": "Marijuana/Combo/Testing Facility/Application"
        },
        "action": {
          "usageType": "copyToChild",
          "CONTACTS": [
            "ALL"
          ],
          "ASI": [
            "ALL"
          ],
          "ASIT": [
            "ALL"
          ],
          "CONDITIONS": [
            "ALL"
          ],
          "ADDRESS": [
          ],
          "Renewal": false,
          "LICENSEDPROFESSIONALS": [
            "ALL"
          ],
          "ASSETS": [
            "ALL"
          ],
          "keepExistingAPO": false,
          "RECORDDETAILS": false,
          "RECORDNAME": false,
          "PARCEL": false,
          "OWNER": false,
          "ADDITIONALINFO": false,
          "EDUCATION": false,
          "CONTEDUCATION": false,
          "EXAM": false,
          "DOCUMENT": false
        },
        "postScript": ""
      }
    ]
  }
}

- Available "usageType": copyToParent, copyFromParent and copyToChild
- "recordType" can be un-set, if so, all parent/child records from all types will be used
- for items to copy, ex "ASIT", should be in Array: ["type1","type2","..."] values allowed ["ALL"] copy all, a "TYPE" copy this TYPE only, empty array [] don't copy
Notes:
- Pageflow Event, script should be placed onLoad of step-1 / page-1, once only to prevent data duplication
- Copy RECORDDETAILS uses method aa.cap.copyCapDetailInfo() (as is), the method copy some of the fields, not all of them
- Copy RECORDNAME is handled
- Only Following is supported in Pageflow: Contact, APO , LP and Parcel
- Copy Document is not supported in ACA
 *
 */

//CONSTANTS
var TO_PARENT = 1;
var FROM_PARENT = 2;
var TO_CHILD = 3;
var USAGE_TYPES = new Array();
USAGE_TYPES["copyfromparent"] = FROM_PARENT;
USAGE_TYPES["copytoparent"] = TO_PARENT;
USAGE_TYPES["copytochild"] = TO_CHILD;

// this function is added so this script would work on pageflow
function getScriptText(vScriptName, servProvCode, useProductScripts) {
	if (!servProvCode)
		servProvCode = aa.getServiceProviderCode();
	vScriptName = vScriptName.toUpperCase();
	var emseBiz = aa.proxyInvoker.newInstance("com.accela.aa.emse.emse.EMSEBusiness").getOutput();
	try {
		if (useProductScripts) {
			var emseScript = emseBiz.getMasterScript(aa.getServiceProviderCode(), vScriptName);
		} else {
			var emseScript = emseBiz.getScriptByPK(aa.getServiceProviderCode(), vScriptName, "ADMIN");
		}
		return emseScript.getScriptText() + "";
	} catch (err) {
		return "";
	}
}

// This should be included in all Configurable Scripts
eval(getScriptText("CONFIGURABLE_SCRIPTS_COMMON"));
var scriptSuffix = "COPY_RECORD_DATA";

try {

	var capIdsArray = null;

	var settingsArray = [];
	if (isConfigurableScript(settingsArray, scriptSuffix)) {

		for (s in settingsArray) {
			var rules = settingsArray[s];

			//Execute PreScript
			var preScript = rules.preScript;
			if (!matches(preScript, null, "")) {
				eval(getScriptText(preScript));
			}
			if (cancelCfgExecution) {
				logDebug("**WARN STDBASE Script [" + scriptSuffix + "] canceled by cancelCfgExecution");
				cancelCfgExecution = false;
				continue;
			}
			
			copyRecordData(rules);

			var postScript = rules.postScript;
			if (!matches(postScript, null, "")) {
				eval(getScriptText(postScript));
			}
		} //for all settings
	} //isConf()
} catch (ex) {
	logDebug("**ERROR: Exception while verification the rules for " + scriptSuffix + ". Error: " + ex);
}

function copyRecordData(rules) {
	var isRenewal = false;
	if (rules.action.hasOwnProperty("Renewal") && String(rules.action.Renewal) != "") {
		isRenewal = rules.action.Renewal;
	}

	if (isRenewal) {
		var parentcapID = getParentCapID4Renewal();
		if (typeof parentcapID == undefined || !parentcapID || parentcapID == null || parentcapID == "") {
			logDebug("**WARN " + scriptSuffix + " parentcapID is null or empty, this is NOT a Renewal?");
		} else {
			var parentcapIDs = parentcapID.toString().split("-");
			var pID = aa.cap.getCapID(parentcapIDs[0], parentcapIDs[1], parentcapIDs[2]).getOutput();
			if (pID != null && pID != "") {
				var result = aa.cap.createRenewalCap(pID, capId, true);
			}
		}//parentcapID OK
	}//renewal=true

	//set usageType, toLower() : avoid upper/lower mistakes in JSON
	var usageType = USAGE_TYPES[rules.action.usageType.toLowerCase()];
	capIdsArray = getCapIdsArray(rules.criteria.recordType, usageType, isRenewal);
	if (capIdsArray == null || capIdsArray.length == 0) {
		logDebug("**INFO capIdsArray empty or null, usageType=" + rules.action.usageType);
		return;
	}

	copyContactsLocal(capIdsArray, rules.action.CONTACTS, usageType);
	copyAppSpecificLocal(capIdsArray, rules.action.ASI, usageType);
	copyAppSpecificTableLocal(capIdsArray, rules.action.ASIT, usageType);
	copyAppConditionsLocal(capIdsArray, rules.action.CONDITIONS, usageType);
	copyAppAddressesLocal(capIdsArray, rules.action.ADDRESS, usageType, rules.keepExistingAPO);
	copyAppLPLocal(capIdsArray, rules.action.LICENSEDPROFESSIONALS, usageType);
	copyAssetsLocal(capIdsArray, rules.action.ASSETS, usageType);

	if (rules.action.RECORDNAME) {
		copyRecordNameLocal(capIdsArray, usageType);
	}
	if (rules.action.RECORDDETAILS) {
		copyRecordDetailsLocal(capIdsArray, usageType);
	}
	if (rules.action.PARCEL) {
		copyParcelsLocal(capIdsArray, usageType, rules.action.keepExistingAPO);
	}
	if (rules.action.OWNER) {
		copyOwnerLocal(capIdsArray, usageType, rules.action.keepExistingAPO);
	}
	if (rules.action.ADDITIONALINFO) {
		copyAdditionalInfoLocal(capIdsArray, usageType);
	}
	if (rules.action.EDUCATION) {
		copyEducationLocal(capIdsArray, usageType);
	}
	if (rules.action.CONTEDUCATION) {
		copyContEducationLocal(capIdsArray, usageType);
	}
	if (rules.action.EXAM) {
		copyExamsLocal(capIdsArray, usageType);
	}
	if (rules.action.DOCUMENT) {
		copyDocumentsLocal(capIdsArray, usageType);
	}
}

/**
 * Copy Contacts from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyTypes ALL or a bar separated values (group names, or types)
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyContactsLocal(capIdsArray, copyTypes, copyDirection) {
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyContactsLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		copyTypes = getCopyTypesArray(copyTypes);
		//handle ("" means don't copy)
		if (copyTypes != null && copyTypes.length == 0) {
			return;
		}

		//ACA PageFlow/ FROM_PARENT
		if (controlString.equalsIgnoreCase("Pageflow") && copyDirection == FROM_PARENT) {
			var currCapModel = aa.env.getValue('CapModel');
			copyContactFromParent4ACA(currCapModel, srcDestArray["src"], copyTypes);
			//copy from 1st parent only (other will just overwrite)
			return;
		}

		if (copyTypes == null) {
			copyContacts(srcDestArray["src"], srcDestArray["dest"]);
		} else {
			for (cd in copyTypes) {
				copyContactsByType(srcDestArray["src"], srcDestArray["dest"], copyTypes[cd]);
			}
		}

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}

/**
 * Copy ASI from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyTypes all or a bar separated values (group names, or types)
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyAppSpecificLocal(capIdsArray, copyTypes, copyDirection) {
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);
		if (!srcDestArray) {
			logDebug("**INFO: copyAppSpecificLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		copyTypes = getCopyTypesArray(copyTypes);
		//handle ("" means don't copy)
		if (copyTypes != null && copyTypes.length == 0) {
			return;
		}

		//ACA PageFlow/ FROM_PARENT
		if (controlString.equalsIgnoreCase("Pageflow") && copyDirection == FROM_PARENT) {
			var currCapModel = aa.env.getValue('CapModel');
			copyASIFromParent4ACA(currCapModel, srcDestArray["src"], copyTypes);
			//copy from 1st parent only (other will just overwrite)
			return;
		}

		copyAppSpecificByType(srcDestArray["src"], srcDestArray["dest"], copyTypes);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy ASIT from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyTypes all or a bar separated values (group names, or types)
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyAppSpecificTableLocal(capIdsArray, copyTypes, copyDirection) {
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyAppSpecificTableLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		copyTypes = getCopyTypesArray(copyTypes);
		//handle ("" means don't copy)
		if (copyTypes != null && copyTypes.length == 0) {
			return;
		}

		//ACA PageFlow/ FROM_PARENT
		if (controlString.equalsIgnoreCase("Pageflow") && copyDirection == FROM_PARENT) {
			var currCapModel = aa.env.getValue('CapModel');
			copyAsitFromParent4ACA(currCapModel, srcDestArray["src"], copyTypes);
			//copy from 1st parent only (other will just overwrite)
			return;
		}

		copyASITablesByType(srcDestArray["src"], srcDestArray["dest"], copyTypes);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Conditions from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyTypes all or a bar separated values (group names, or types)
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyAppConditionsLocal(capIdsArray, copyTypes, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}

	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyAppConditionsLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		copyTypes = getCopyTypesArray(copyTypes);
		//handle ("" means don't copy)
		if (copyTypes != null && copyTypes.length == 0) {
			return;
		}

		copyConditionsByType(srcDestArray["src"], srcDestArray["dest"], copyTypes);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Addresses from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyTypes all or a bar separated values (group names, or types)
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyAppAddressesLocal(capIdsArray, copyTypes, copyDirection, keepExistingAPO) {
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyAppAddressesLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		copyTypes = getCopyTypesArray(copyTypes);
		//handle ("" means don't copy)
		if (copyTypes != null && copyTypes.length == 0) {
			return;
		}

		//delete existing
		deleteExistingAPO(srcDestArray["dest"], keepExistingAPO, "A");

		//ACA PageFlow/ FROM_PARENT
		if (controlString.equalsIgnoreCase("Pageflow") && copyDirection == FROM_PARENT) {
			var currCapModel = aa.env.getValue('CapModel');
			copyAddressFromParent4ACA(currCapModel, srcDestArray["src"], copyTypes);
			//copy from 1st parent only (other will just overwrite)
			return;
		}

		copyAddressesByType(srcDestArray["src"], srcDestArray["dest"], copyTypes);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Licensed Professionals from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyTypes all or a bar separated values (group names, or types)
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyAppLPLocal(capIdsArray, copyTypes, copyDirection) {

	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyAppLPLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		copyTypes = getCopyTypesArray(copyTypes);
		//handle ("" means don't copy)
		if (copyTypes != null && copyTypes.length == 0) {
			return;
		}

		if (controlString.equalsIgnoreCase("Pageflow")) {
			var currCapModel = aa.env.getValue('CapModel');
			copyLPFromParent4ACA(currCapModel, srcDestArray["src"], copyTypes);
			return;
		}

		copyLicensedProfByType(srcDestArray["src"], srcDestArray["dest"], copyTypes);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Assets from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyTypes all or a bar separated values (group names, or types)
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyAssetsLocal(capIdsArray, copyTypes, copyDirection) {
	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyAssetsLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		copyTypes = getCopyTypesArray(copyTypes);
		//handle ("" means don't copy)
		if (copyTypes != null && copyTypes.length == 0) {
			return;
		}
		copyAssetsByType(srcDestArray["src"], srcDestArray["dest"], copyTypes);
		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Parcels from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyParcelsLocal(capIdsArray, copyDirection, keepExistingAPO) {

	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyParcelsLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		//delete existing
		deleteExistingAPO(srcDestArray["dest"], keepExistingAPO, "P");

		//ACA PageFlow/ FROM_PARENT
		if (controlString.equalsIgnoreCase("Pageflow") && copyDirection == FROM_PARENT) {
			var currCapModel = aa.env.getValue('CapModel');
			copyParcelsFromParent4ACA(currCapModel, srcDestArray["src"]);

			//copy from 1st parent only (other will just overwrite)
			return;
		}

		copyParcels(srcDestArray["src"], srcDestArray["dest"]);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Owner from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyOwnerLocal(capIdsArray, copyDirection, keepExistingAPO) {
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyOwnerLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		//delete existing
		deleteExistingAPO(srcDestArray["dest"], keepExistingAPO, "O");

		//ACA PageFlow/ FROM_PARENT
		if (controlString.equalsIgnoreCase("Pageflow") && copyDirection == FROM_PARENT) {
			var currCapModel = aa.env.getValue('CapModel');
			copyOwnersFromParent4ACA(currCapModel, srcDestArray["src"]);
			//copy from 1st parent only (other will just overwrite)
			return;
		}

		copyOwner(srcDestArray["src"], srcDestArray["dest"]);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Education from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyEducationLocal(capIdsArray, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}

	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyEducationLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		var cr = aa.education.copyEducationList(srcDestArray["src"], srcDestArray["dest"]);

		if (!cr.getSuccess()) {
			logDebug("**INFO: copyEducationLocal(): failed: " + cr.getErrorMessage());
		}
		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Exams from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyExamsLocal(capIdsArray, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyExamsLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		var cr = aa.examination.copyExaminationList(srcDestArray["src"], srcDestArray["dest"]);

		if (!cr.getSuccess()) {
			logDebug("**INFO: copyExamsLocal(): failed: " + cr.getErrorMessage());
		}
		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Documents from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyDocumentsLocal(capIdsArray, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		if (!srcDestArray) {
			logDebug("**INFO: copyDocumentsLocal(): Invalid usageType: " + copyDirection);
			return false;
		}

		if (controlString == "ConvertToRealCAPAfter" && copyDirection == FROM_PARENT) {
			copyDocumentFromParent4ACA(srcDestArray["src"]);
			return;
		} else {
			aa.cap.copyRenewCapDocument(srcDestArray["src"], srcDestArray["dest"], aa.getAuditID());
		}

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Additional Info from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyAdditionalInfoLocal(capIdsArray, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}

	for (ca in capIdsArray) {
		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		var adFrom = aa.cap.getBValuatn4AddtInfo(srcDestArray["src"]);
		if (!adFrom.getSuccess()) {
			logDebug("**INFO: copyAdditionalInfoLocal(): failed: " + adFrom.getErrorMessage());
			return false;
		}
		adFrom = adFrom.getOutput();
		var valueTnFrom = adFrom.getbValuatn();

		var cdFrom = aa.cap.getCapDetail(srcDestArray["src"]);
		if (!cdFrom.getSuccess()) {
			logDebug("**INFO: copyAdditionalInfoLocal(): failed: " + cdFrom.getErrorMessage());
			return false;
		}
		cdFrom = cdFrom.getOutput();

		var adTo = aa.cap.getBValuatn4AddtInfo(srcDestArray["dest"]);
		if (!adTo.getSuccess()) {
			logDebug("**INFO: copyAdditionalInfoLocal(): failed: " + adTo.getErrorMessage());
			return false;
		}
		adTo = adTo.getOutput();
		var valueTnTo = adTo.getbValuatn();

		var cdTo = aa.cap.getCapDetail(srcDestArray["dest"]);
		if (!cdTo.getSuccess()) {
			logDebug("**INFO: copyAdditionalInfoLocal(): failed: " + cdTo.getErrorMessage());
			return false;
		}
		cdTo = cdTo.getOutput();

		adTo.setFeeFactorFlag(adFrom.getFeeFactorFlag());
		adTo.setEstimatedValue(adFrom.getEstimatedValue());
		adTo.setValuationPeriod(adFrom.getValuationPeriod());
		adTo.setCalculatedValue(adFrom.getCalculatedValue());
		adTo.setPlanCheckValue(adFrom.getPlanCheckValue());

		adTo.getbValuatn().setFeeFactorFlag(valueTnFrom.getFeeFactorFlag());
		adTo.getbValuatn().setEstimatedValue(valueTnFrom.getEstimatedValue());
		adTo.getbValuatn().setValuationPeriod(valueTnFrom.getValuationPeriod());
		adTo.getbValuatn().setCalculatedValue(valueTnFrom.getCalculatedValue());
		adTo.getbValuatn().setPlanCheckValue(valueTnFrom.getPlanCheckValue());

		cdTo.setHouseCount(cdFrom.getHouseCount());
		cdTo.setConstTypeCode(cdFrom.getConstTypeCode());
		cdTo.setBuildingCount(cdFrom.getBuildingCount());
		cdTo.setPublicOwned(cdFrom.getPublicOwned());

		aa.cap.editAddtInfo(cdTo, adTo);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Record Details from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyRecordDetailsLocal(capIdsArray, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}

	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		aa.cap.copyCapDetailInfo(srcDestArray["src"], srcDestArray["dest"]);

		//for Description Field
		aa.cap.copyCapWorkDesInfo(srcDestArray["src"], srcDestArray["dest"]);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
/**
 * Copy Continuing Education from Current record to Parent or Child records, Or from Parent to Current Record, based on copyDirection parameter
 * @param capIdsArray array of Parent or Child CapIdModel
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns {Boolean} true if success, false otherwise
 */
function copyContEducationLocal(capIdsArray, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}
	for (ca in capIdsArray) {

		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		aa.continuingEducation.copyContEducationList(srcDestArray["src"], srcDestArray["dest"]);

		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}
function copyRecordNameLocal(capIdsArray, copyDirection) {

	//This Portlet is not supported in Pageflow
	if (controlString.equalsIgnoreCase("Pageflow")) {
		return;
	}

	for (ca in capIdsArray) {
		var srcDestArray = getCopySrcDest(capId, capIdsArray[ca], copyDirection);

		var fromCapModel = aa.cap.getCapByPK(srcDestArray["src"], true);
		if (fromCapModel.getSuccess()) {
			fromCapModel = fromCapModel.getOutput();

			var toCapModel = aa.cap.getCapByPK(srcDestArray["dest"], true);
			if (toCapModel.getSuccess()) {
				toCapModel = toCapModel.getOutput();
				toCapModel.setSpecialText(fromCapModel.getSpecialText());
				aa.cap.editCapByPK(toCapModel).getSuccess();
			}
		}
		//copy from 1st parent only (other will just overwrite)
		if (copyDirection == FROM_PARENT) {
			return true;
		}
	} //for all capIdsArray
	return true;
}

/**
 * get a list of Parent or Child records related to Current capId.<br>- Child or Parent is determined by copyDirection parameter
 * @param recordType get Caps of this type only, null or empty means ANY
 * @param copyDirection Number: TO_PARENT = 1, FROM_PARENT = 2, TO_CHILD = 3
 * @returns array of CapIdModel
 */
function getCapIdsArray(recordType, copyDirection, isRenewal) {
	var capIdsArray = null;
	if ((recordType == null || recordType.equals("")) && copyDirection == FROM_PARENT) {
		logDebug("**INFO recordType=null && FROM_PARENT, abort");
		return new Array();
	}

	if (controlString == "Pageflow" && (copyDirection == FROM_PARENT || copyDirection == TO_PARENT)) {
		var myParentCapID = getParentCapId4ACA(capId);

		if (myParentCapID == null) {
			logDebug("**INFO could not get parent CAP-ID for: " + capId);
			return new Array();
		}

		capIdsArray = new Array();
		capIdsArray.push(myParentCapID);
		return capIdsArray;
	}

	if (controlString == "ConvertToRealCAPAfter" && (copyDirection == FROM_PARENT || copyDirection == TO_PARENT)) {
		var myParentCapID = aa.env.getValue("ParentCapID"); //getParentByCapId(capId);
		if (myParentCapID == null || myParentCapID == "") {
			logDebug("**INFO could not get parent CAP-ID for: " + capId);
			return new Array();
		}

		capIdsArray = new Array();
		capIdsArray.push(myParentCapID);
		return capIdsArray;
	}

	if (copyDirection == TO_PARENT || copyDirection == FROM_PARENT) {
		if (isRenewal) {
			capIdsArray = new Array();
			var tmpParentId = getParentCapID4Renewal();
			capIdsArray.push(tmpParentId);
			return capIdsArray;
		}

		if (recordType == null || recordType.equals("")) {
			capIdsArray = getParents();
		} else {
			capIdsArray = getParents(recordType);
		}

	} else if (copyDirection == TO_CHILD) {
		capIdsArray = getChilds(recordType);
	}

	if (!capIdsArray || capIdsArray == null) {
		capIdsArray = new Array();
	}
	return capIdsArray;
}
/**
 * get list of Child records, related to Current capId
 * @param recordType
 * @returns array of CapIdModel
 */
function getChilds(recordType) {
	var caps = aa.cap.getChildByMasterID(capId);
	if (caps.getSuccess()) {
		caps = caps.getOutput();
	} else {
		logDebug("**INFO: getChilds returned an error: " + caps.getErrorMessage());
		return null;
	}

	if (!caps.length) {
		logDebug("**INFO: getChilds function found no children");
		return null
	}

	var recordTypeArray = null;
	var resultArray = new Array();

	for (c in caps) {
		//All
		if (recordType == null || recordType.equals("")) {
			resultArray.push(caps[c].getCapID());
		} else if (caps[c].getCapType().toString().equals(recordType)) {
			resultArray.push(caps[c].getCapID());
		} //recordTypeArray !null
	} //for all childs
	return resultArray;
}
/**
 * puts capId1 and capId2 in an array ["src"], ["dest"] based on copyDirection
 * @param capId1 CapID of current record
 * @param capId2 CapID of Other record
 * @param copyDirection Number, TO_PARENT=1, FROM_PARENT=2 and TO_CHILD=3
 * @returns Associative array ["src"], ["dest"], or false if copyDirection not supported
 */
function getCopySrcDest(capId1, capId2, copyDirection) {
	var srcDestArr = new Array();
	if (copyDirection == TO_PARENT || copyDirection == TO_CHILD) {
		srcDestArr["src"] = capId1;
		srcDestArr["dest"] = capId2;
	} else if (copyDirection == FROM_PARENT) {
		srcDestArr["src"] = capId2;
		srcDestArr["dest"] = capId1;
	} else {
		return false;
	}
	return srcDestArr;
}
/**
 *
 * @param copyTypes {Array} have "ALL" Or types/group names
 * @returns null, if copyTypes length=1 and copyTypes[0] equals "ALL", otherwise, returns same array
 */
function getCopyTypesArray(copyTypes) {
	if (copyTypes && copyTypes != null && copyTypes != "" && copyTypes.length > 0 && copyTypes[0].equalsIgnoreCase("all")) {
		return null;
	} else if (copyTypes == null || copyTypes == "") {
		return new Array();
	} else {
		return copyTypes;
	}
}
///ACA (PageFlow) METHODS-----------------------

function copyDocumentFromParent4ACA(parentCapId) {
	var capDocumentList = aa.document.getDocumentListByEntity(String(parentCapId), "CAP").getOutput();
	if (capDocumentList == null || capDocumentList.size() == 0) {
		return;
	}
	copyAssosiateFormDocuments(capDocumentList, capId);
}

function copyAssosiateFormDocuments(documentList, toCapIDModel) {
	var edmsPolicyModel = aa.proxyInvoker.newInstance("com.accela.aa.policy.policy.EdmsPolicyModel").getOutput();
	var documentBusiness = aa.proxyInvoker.newInstance("com.accela.aa.ads.ads.DocumentBusiness").getOutput();
	if (documentList != null && documentList.size() > 0) {
		for (var i = 0; i < documentList.size(); i++) {
			var documentModel = documentList.get(i);
			var documentContentModel = documentBusiness.getDocumentContent(aa.getServiceProviderCode(), documentModel.getDocumentNo());
			documentModel.setEntityID(toCapIDModel.getID1() + "-" + toCapIDModel.getID2() + "-" + toCapIDModel.getID3());
			documentModel.setEntityType("CAP");
			documentModel.setDocumentContent(documentContentModel);
			var documenta = aa.document.createDocument(documentModel);
			if (documentModel.getDocumentContent() != null && documentModel.getDocumentContent().getDocInputStream() != null) {
				documentModel.getDocumentContent().getDocInputStream().close();
			}
		}
		for (var i = 0; i < documentList.size(); i++) {
			var clearModel = documentList.get(i);
			if (clearModel.getDocumentContent() != null) {
				clearModel.setDocumentContent(null);
			}
		}
	}
}

function copyAddressFromParent4ACA(currentRecordCapModel, parentCapId, typesArray) {

	var capAddressResult = aa.address.getAddressWithAttributeByCapId(parentCapId).getOutput();
	if (capAddressResult == null || capAddressResult.length == 0) {
		return;
	}

	var adrr = getPrimaryOrAddressByType(capAddressResult, typesArray);
	if (adrr != null) {
		currentRecordCapModel.setAddressModel(adrr);
	}
}
function getPrimaryOrAddressByType(addresses, typesArray) {
	var ourTypeAddress = null;

	for (a in addresses) {
		if (typesArray != null && arrayContainsValue(typesArray, addresses[a].getAddressType()) && addresses[a].getPrimaryFlag() == "Y") {
			return addresses[a];
		} else if (typesArray == null && addresses[a].getPrimaryFlag() == "Y") {
			return addresses[a];
		} else if (typesArray != null && arrayContainsValue(typesArray, addresses[a].getAddressType()) && ourTypeAddress == null) {
			ourTypeAddress = addresses[a];
		} else if (typesArray == null && ourTypeAddress == null) {
			ourTypeAddress = addresses[a];
		}
	} //for

	return ourTypeAddress;
}
function copyParcelsFromParent4ACA(currentRecordCapModel, parentCapId) {

	//assume primary parcel is at index=0
	var primaryIndex = 0;

	var capParcelResult = aa.parcel.getParcelandAttribute(parentCapId, null).getOutput();

	if (capParcelResult == null || capParcelResult.size() == 0) {
		return;
	}

	for (var i = 0; i < capParcelResult.size(); i++) {

		if (capParcelResult.get(i).getPrimaryParcelFlag() == "Y") {
			primaryIndex = i;
			break;
		}
	} //for all parcels

	var capParcel = aa.parcel.getCapParcelModel().getOutput();
	capParcel.setParcelModel(capParcelResult.get(primaryIndex));
	currentRecordCapModel.setParcelModel(capParcel);
}

function copyOwnersFromParent4ACA(currentRecordCapModel, parentCapId) {
	var owners = aa.owner.getOwnerByCapId(parentCapId).getOutput();
	if (owners.length > 0) {
		currentRecordCapModel.setOwnerModel(owners[0].getCapOwnerModel());
	}
}

function copyLPFromParent4ACA(currentRecordCapModel, parentCapId, typesArray) {

	if (currentRecordCapModel.getLicenseProfessionalList() == null) {
		currentRecordCapModel.setLicenseProfessionalList(aa.util.newArrayList());
	}
	if (currentRecordCapModel.getLicenseProfessionalList().size() > 0) {
		return;
	}

	var t = aa.licenseProfessional.getLicenseProf(parentCapId);
	if (t.getSuccess()) {
		t = t.getOutput();

		for (lp in t) {
			if (typesArray != null && !arrayContainsValue(typesArray, t[lp].getLicenseProfessionalModel().getLicenseType())) {
				continue;
			}

			var newLicenseModel = t[lp].getLicenseProfessionalModel();
			newLicenseModel.setComponentName(null);
			newLicenseModel.setCapID(null);
			newLicenseModel.setAgencyCode(aa.getServiceProviderCode());
			newLicenseModel.setAuditID(aa.getAuditID());
			currentRecordCapModel.getLicenseProfessionalList().add(newLicenseModel);

			return;
		}
	}
}

function copyContactFromParent4ACA(currentRecordCapModel, parentCapId, typesArray) {
	contactsGroup = currentRecordCapModel.getContactsGroup();
	if (contactsGroup.size() > 0) {
		return;
	}
	var t = aa.people.getCapContactByCapID(parentCapId);
	if (t.getSuccess()) {
		capPeopleArr = t.getOutput();
		for (cp in capPeopleArr) {
			if (typesArray != null && !arrayContainsValue(typesArray, capPeopleArr[cp].getCapContactModel().getPeople().getContactType())) {
				continue;
			}
			capPeopleArr[cp].getCapContactModel().setCapID(null);
			//contactsGroup.add(capPeopleArr[cp].getCapContactModel());
			contactAddFromUser4ACA(currentRecordCapModel, capPeopleArr[cp].getCapContactModel());
			return;
		} //for all contacts from parent
	} //get paretn contacts success
}

function contactAddFromUser4ACA(capModel, contactModel) {
	var theContact = contactModel.getPeople();
	var capContactModel = aa.proxyInvoker.newInstance("com.accela.aa.aamain.people.CapContactModel").getOutput();
	capContactModel.setContactType(theContact.getContactType());
	capContactModel.setFirstName(theContact.getFirstName());
	capContactModel.setMiddleName(theContact.getMiddleName());
	capContactModel.setLastName(theContact.getLastName());
	capContactModel.setFullName(theContact.getFullName());
	capContactModel.setEmail(theContact.getEmail());
	capContactModel.setPhone2(theContact.getPhone2());
	capContactModel.setPhone1CountryCode(theContact.getPhone1CountryCode());
	capContactModel.setPhone2CountryCode(theContact.getPhone2CountryCode());
	capContactModel.setPhone3CountryCode(theContact.getPhone3CountryCode());
	capContactModel.setCompactAddress(theContact.getCompactAddress());
	capContactModel.sePreferredChannele(theContact.getPreferredChannel()); // Preferred Channel is used for 'Particiapnt Type' in ePermits. Yes, the function itself is misspelled, just use it like this.
	capContactModel.setPeople(theContact);
	var birthDate = theContact.getBirthDate();
	if (birthDate != null && birthDate != "") {
		capContactModel.setBirthDate(aa.util.parseDate(birthDate));
	}
	var peopleAttributes = aa.people.getPeopleAttributeByPeople(theContact.getContactSeqNumber(), theContact.getContactType()).getOutput();
	if (peopleAttributes) {
		var newPeopleAttributes = aa.util.newArrayList();
		for ( var i in peopleAttributes) {
			newPeopleAttributes.add(peopleAttributes[i].getPeopleAttributeModel())
		}
		capContactModel.getPeople().setAttributes(newPeopleAttributes)
	}
	capModel.getContactsGroup().add(capContactModel);

}

function copyASIFromParent4ACA(currentRecordCapModel, parentCapId, typesArray) {
	var asiGroups = currentRecordCapModel.getAppSpecificInfoGroups();
	var asiArray = new Array();
	loadAppSpecific4ACA(asiArray, parentCapId);
	setFieldValue(asiArray, asiGroups, typesArray);
}

function copyAsitFromParent4ACA(currentRecordCapModel, parentCapId, typesArray) {
	var currentRecordAsitGroups = capModel.getAppSpecificTableGroupModel();

	if (currentRecordAsitGroups == null || currentRecordAsitGroups.getTablesMap() == null) {
		return;
	}

	var ta = currentRecordAsitGroups.getTablesMap().values();
	var tai = ta.iterator();
	while (tai.hasNext()) {
		var tsm = tai.next();
		var tableName = "" + tsm.getTableName().toString();
		if (typesArray != null && !arrayContainsValue(typesArray, tableName)) {
			continue;
		}
		var asitArray = loadASITable(tableName, parentCapId);
		currentRecordAsitGroups = addASITable4ACAPageFlowCamp(currentRecordAsitGroups, tableName, asitArray, capModel.getCapID());
	}
}

function setFieldValue(asiValuesArray, asiGroups, typesArray) {
	if (asiGroups == null) {
		return false;
	}
	var iteGroups = asiGroups.iterator();
	while (iteGroups.hasNext()) {
		var group = iteGroups.next();
		if (typesArray != null && !arrayContainsValue(typesArray, group.getGroupName())) {
			continue;
		}
		var fields = group.getFields();
		if (fields != null) {
			var iteFields = fields.iterator();
			while (iteFields.hasNext()) {
				var field = iteFields.next();
				field.setChecklistComment(asiValuesArray[field.getCheckboxDesc()]);
			}
		}
	} //for all groups
	return true;
}

function addASITable4ACAPageFlowCamp(destinationTableGroupModel, tableName, tableValueArray) {
	var itemCap = capId
	if (arguments.length > 3)
		itemCap = arguments[3];

	if (destinationTableGroupModel == null || destinationTableGroupModel.getTablesMap() == null) {
		return;
	}

	var ta = destinationTableGroupModel.getTablesMap().values();
	var tai = ta.iterator();

	var found = false;
	while (tai.hasNext()) {
		var tsm = tai.next();
		if (tsm.getTableName().equals(tableName)) {
			if (tsm.getTableFields() != null && tsm.getTableFields().size() > 0) {
				return destinationTableGroupModel;
			}
			found = true;
			break;
		}
	}

	if (!found) {
		logDebug("cannot update asit for ACA, no matching table name");
		return false;
	}

	var i = -1;
	if (tsm.getTableFields() != null) {
		i = 0 - tsm.getTableFields().size()
	}

	for (thisrow in tableValueArray) {
		var fld = aa.util.newArrayList();
		var fld_readonly = aa.util.newArrayList();
		var col = tsm.getColumns()
		var coli = col.iterator();
		while (coli.hasNext()) {
			var colname = coli.next();
			if (!tableValueArray[thisrow][colname.getColumnName()]) {
				logDebug("addToASITable: null or undefined value supplied for column " + colname.getColumnName() + ", setting to empty string");
				tableValueArray[thisrow][colname.getColumnName()] = "";
			}

			if (typeof (tableValueArray[thisrow][colname.getColumnName()].fieldValue) != "undefined") {
				var args = new Array(tableValueArray[thisrow][colname.getColumnName()].fieldValue ? tableValueArray[thisrow][colname.getColumnName()].fieldValue : "", colname);
				var fldToAdd = aa.proxyInvoker.newInstance("com.accela.aa.aamain.appspectable.AppSpecificTableField", args).getOutput();
				fldToAdd.setRowIndex(i);
				fldToAdd.setFieldLabel(colname.getColumnName());
				fldToAdd.setFieldGroup(tableName.replace(/ /g, "\+"));
				fldToAdd.setReadOnly(tableValueArray[thisrow][colname.getColumnName()].readOnly.equals("Y"));
				fld.add(fldToAdd);
				fld_readonly.add(tableValueArray[thisrow][colname.getColumnName()].readOnly);

			} else {
				var args = new Array(tableValueArray[thisrow][colname.getColumnName()] ? tableValueArray[thisrow][colname.getColumnName()] : "", colname);
				var fldToAdd = aa.proxyInvoker.newInstance("com.accela.aa.aamain.appspectable.AppSpecificTableField", args).getOutput();
				fldToAdd.setRowIndex(i);
				fldToAdd.setFieldLabel(colname.getColumnName());
				fldToAdd.setFieldGroup(tableName.replace(/ /g, "\+"));
				fldToAdd.setReadOnly(false);
				fld.add(fldToAdd);
				fld_readonly.add("N");
			}
		}
		i--;
		if (tsm.getTableFields() == null) {
			tsm.setTableFields(fld);
		} else {
			tsm.getTableFields().addAll(fld);
		}
		if (tsm.getReadonlyField() == null) {
			tsm.setReadonlyField(fld_readonly);
		} else {
			tsm.getReadonlyField().addAll(fld_readonly);
		}
	}

	tssm = tsm;
	return destinationTableGroupModel;
}
function getParentCapId4ACA(myCapId) {
	var getCapResult = aa.cap.getProjectParents(myCapId, 1);
	if (getCapResult.getSuccess()) {
		var parentArray = getCapResult.getOutput();
		if (parentArray.length) {
			return parentArray[0].getCapModel().getCapID();
		}
	}
	return null;
}

/**
 * Deletes selected component from deleteFromCapId if keepExisting is true,<br/>flag 'keepExisting' is passed and checked in case it's coming from a settings source
 * @param deleteFromCapId capId to delete related APO from
 * @param keepExisting boolean, check if delete required
 * @param whichAPO which component to delete A: address P: Parcel O:Owner
 */
function deleteExistingAPO(deleteFromCapId, keepExisting, whichAPO) {
	if (keepExisting || whichAPO == null || whichAPO == "") {
		return;
	}

	if (whichAPO.equalsIgnoreCase("A")) {
		var addresses = aa.address.getAddressByCapId(deleteFromCapId, null);
		if (addresses.getSuccess()) {
			addresses = addresses.getOutput();
			for (a in addresses) {
				aa.address.removeAddress(deleteFromCapId, addresses[a].getAddressId());
			}
		}
	} else if (whichAPO.equalsIgnoreCase("P")) {
		var pbzns = aa.proxyInvoker.newInstance("com.accela.aa.aamain.parcel.ParcelBusiness").getOutput();
		var capModelDeleteFrom = aa.cap.getCap(deleteFromCapId);
		if (capModelDeleteFrom.getSuccess()) {
			capModelDeleteFrom = capModelDeleteFrom.getOutput();
			capModelDeleteFrom = capModelDeleteFrom.getCapModel();
			pbzns.removeParcel(capModelDeleteFrom);
		}
	} else if (whichAPO.equalsIgnoreCase("O")) {
		var owners = null;
		owners = aa.owner.getOwnerByCapId(deleteFromCapId);
		if (owners.getSuccess()) {
			owners = owners.getOutput();
			for (o in owners) {
				aa.owner.removeCapOwnerModel(owners[o]);
			}
		}
	}
}
