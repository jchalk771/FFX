/*==========================================================================================
Title : STDBASE_LICENSE_ISSUANCE

Purpose : Creates license record, LPs, expiration dates and relationships

Author: David Bischof

Functional Area : 

Description : JSON must contain :

{
  "Marijuana/Combo/Testing Facility/License": {                        
    "WorkflowTaskUpdateAfter": [                                     
      {
        "preScript": "",                                               
        "metadata": {                                                  
          "description": "License Issuance",
          "operators": {
            
          }
        },
        "criteria": {
          "task": [
            "License Status"
          ],
          "status": [
            "Active"
          ]
        },
        "action": {
          "parentLicense": "Marijuana/Combo/Testing Facility/License",
          "issuedStatus": "Issued",
          "copyCF": true,
          "copyCT": true,
          "copyEducation": false,
          "copyContinuingEducation": false,
          "copyExamination": false,
          "copyContacts": false,
          "expirationType": "Days",    /// this accept Expiration Code or Days or Function
          "customExpirationFunction": "", // if the expiration type is function then this will be the funciton name,
          "expirationPeriod": "30",
          "refLPType": "Architect",
          "contactType": "Employee",
          "createLP": true,
          "licenseTable": "HATEST",
          "childLicense": "Marijuana/Combo/Testing Facility/License",
          "recordIdField": "TEST haetham"
        },
        "postScript": ""
      }
    ]
  }
}
Reviewed By: 

Script Type : (EMSE, EB, Pageflow, Batch): EMSE

General Purpose/Client Specific : General

Client developed for : Louisville

Parameters:
				itemCap - capIdObject
				recordSettings - JSON rule
				
				
update by :  Haetham Eleisah handle custom expiration function to calculate the license expiration date.
================================================================================================================*/
var scriptSuffix = "LICENSE_ISSUANCE";
// CONF_{SOLUTION}_LICENSE_ISSUANCE
// {SOLUTION} = AS DEFINED IN THE "SOLUTION MAPPING" STANDARD CHOICE

try {
	// This should be included in all Configurable Scripts
	eval(getScriptText("CONFIGURABLE_SCRIPTS_COMMON"));

	var settingsArray = [];
	if (isConfigurableScript(settingsArray, scriptSuffix)) {
		for (s in settingsArray) {

			var rules = settingsArray[s];
			logDebug("rules: " + rules);

			//Execute PreScript
			var preScript = rules.preScript;
			if (!isEmptyOrNull(preScript)) {
				eval(getScriptText(preScript, null, false));
			}
			if (cancelCfgExecution) {
				logDebug("**WARN STDBASE Script [" + scriptSuffix + "] canceled by cancelCfgExecution");
				cancelCfgExecution = false;
				continue;
			}
			//Execute licenseIssuance
			licenseIssuance(capId, rules.action);

			// / run post script
			var postScript = rules.preScript;
			if (!isEmptyOrNull(postScript)) {
				eval(getScriptText(postScript, null, false));
			}
		}
	}

} catch (ex) {
	logDebug("**ERROR:Exception while verifying the rules for " + scriptSuffix + ". Error: " + ex);
}

/**
 * Standard base script for License Issuance
 * 
 * @param {CapIdObject} itemCapId 
 * @param {Array} recordSettings
 */
function licenseIssuance(itemCapId, recordSettings) {
	var functionTitle = "licenseIssuance()";
	var debugMode = true;
	// validate JSON parameters using handleUndefined function blah
	// handleUndefine(JSON Parameter, isRequired);
	var rParentLicense = handleUndefined(recordSettings.parentLicense, false);
	var rIssuedStatus = handleUndefined(recordSettings.issuedStatus, false);
	var rLicTable = handleUndefined(recordSettings.licenseTable, false);
	var rCustomExpirationFunction = handleUndefined(recordSettings.customExpirationFunction, false);
	var rHasParent, rLicAppArray, rNewLicId, rNewLicIdString, rVehData, rChildVehId, rC1ExpResult, rB1Model;

	if (rParentLicense != "") {
		rHasParent = true;
		rLicAppArray = rParentLicense.split("/");

		//create license
		rNewLicId = createParent(rLicAppArray[0], rLicAppArray[1], rLicAppArray[2], rLicAppArray[3], null);

		if (!rNewLicId) {
			logDebug("**WARN Failed to createParent() of type:" + rParentLicense);
			return false;
		}

		//call ASA of new record
		var newCap = aa.cap.getCap(rNewLicId).getOutput();
		aa.cap.runEMSEScriptAfterApplicationSubmit(newCap.getCapModel(), rNewLicId);

		rNewLicIdString = rNewLicId.getCustomID();

		if (rIssuedStatus != null && rIssuedStatus != "") {
			updateAppStatus(rIssuedStatus, "", rNewLicId);
		}
		if (recordSettings.copyCF) {
			copyASIFields(itemCapId, rNewLicId);
		}

		if (recordSettings.copyEducation)
			aa.education.copyEducationList(itemCapId, rNewLicId);

		if (recordSettings.copyContinuingEducation)
			aa.continuingEducation.copyContEducationList(itemCapId, rNewLicId);

		if (recordSettings.copyExamination)
			aa.examination.copyExaminationList(itemCapId, rNewLicId);

		if (recordSettings.copyContacts)
			copyContacts(itemCapId, rNewLicId);

		//handle Expiration	
		rB1ExpResult = aa.expiration.getLicensesByCapID(rNewLicId).getOutput();
		if (rB1ExpResult != null) {
			//Get Next Expiration Date if using Expiration Code
			if (recordSettings.expirationType == "Expiration Code") {
				var rExpBiz = aa.proxyInvoker.newInstance("com.accela.aa.license.expiration.ExpirationBusiness").getOutput();
				rB1Model = rB1ExpResult.getB1Expiration();
				rNextDate = rExpBiz.getNextExpDate(rB1Model);
				rB1ExpResult.setExpDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
			}

			if (recordSettings.expirationType == "Days") {
				rB1ExpResult.setExpDate(aa.date.parseDate(dateAdd(aa.util.now(), recordSettings.expirationPeriod)));
			}
			if (recordSettings.expirationType == "Function" && rCustomExpirationFunction != null && rCustomExpirationFunction != "") {
				var dateCalculationFuntion = rCustomExpirationFunction + "( rB1ExpResult )";
				var dateResult = eval("(" + dateCalculationFuntion + ")");
				if (dateResult instanceof Date) {
					rB1ExpResult.setExpDate(aa.date.parseDate(dateAdd(dateResult, 0)));
				} else {
					logDebug("WARNING: Custom Function returned values does not accepted as date");
				}

			}

			if (!isEmptyOrNull(rIssuedStatus))
				rB1ExpResult.setExpStatus(rIssuedStatus);
			aa.expiration.editB1Expiration(rB1ExpResult.getB1Expiration());
		} else {
			logDebug("**WARN rB1ExpResult is null for created Parent License " + rNewLicId);
		}
	}

	if (recordSettings.createLP) {
		//create LP
		createRefLP4Lookup(rNewLicIdString, recordSettings.refLPType, recordSettings.contactType, null);
		//Set Business Name and Exp Date
		rNewLP = aa.licenseScript.getRefLicensesProfByLicNbr(aa.serviceProvider, rNewLicIdString).getOutput();
		if (rNewLP) {
			rThisLP = rNewLP[0];
			rThisLP.setLicenseIssueDate(aa.date.parseDate(dateAdd(aa.util.now(), 0)));

			if (rHasParent && recordSettings.expirationType == "Expiration Code") {
				rThisLP.setLicenseExpirationDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
			}

			if (!rHasParent && recordSettings.expirationType == "Expiration Code") {
				rB1ExpResult = aa.expiration.getLicensesByCapID(itemCapId).getOutput();
				var rExpBiz = aa.proxyInvoker.newInstance("com.accela.aa.license.expiration.ExpirationBusiness").getOutput();
				rB1Model = rB1ExpResult.getB1Expiration();

				rNextDate = rExpBiz.getNextExpDate(rB1Model);
				rB1ExpResult.setExpDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
				aa.expiration.editB1Expiration(rB1ExpResult.getB1Expiration());
				rThisLP.setLicenseExpirationDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
			}

			if (recordSettings.expirationType == "Days") {
				rThisLP.setLicenseExpirationDate(aa.date.parseDate(dateAdd(aa.util.now(), recordSettings.expirationPeriod)));
			}
			if (recordSettings.expirationType == "Function" && rCustomExpirationFunction != null && rCustomExpirationFunction != "") {
				var dateCalculationFuntion = rCustomExpirationFunction + "( rNewLP )";
				var dateResult = eval("(" + dateCalculationFuntion + ")");

				if (dateResult instanceof Date) {
					rThisLP.setLicenseExpirationDate(aa.date.parseDate(dateAdd(dateResult, 0)));
				}
			}
			var editRefResult = aa.licenseScript.editRefLicenseProf(rThisLP);
			if (rHasParent) {
				aa.licenseScript.associateLpWithCap(rNewLicId, rThisLP);
			}

			if (!isEmptyOrNull(rNewLicIdString)) {
				//check if public user exist for the contact type:
				var reqContact = null;
				var contactsList = getContacts();
				if (contactsList && contactsList.length > 0) {

					for (c in contactsList) {
						if (String(contactsList[c]["contactType"]).equalsIgnoreCase(String(recordSettings.contactType))) {
							reqContact = contactsList[c];
							break;
						}
					}//for all cap contacts
				}//cap has contacts
				if (reqContact != null && reqContact["email"] != null && reqContact["email"] != "") {
					var thisPublicUser = getOrCreatePublicUser(reqContact["email"], reqContact["contactSeqNumber"]);
					if (thisPublicUser != null) {
						var publicUserSeqNum = thisPublicUser.getUserSeqNum();
						if (!isLicenseConnectedToPublicUser(publicUserSeqNum, rNewLicIdString)) {
							associateLPToPublicUser(rNewLicIdString, publicUserSeqNum);
						}//user not assoc with LP
					}//thisPublicUser
				}//contact has email
			}//rNewLicIdString is OK
		}//get created LP success (ref LP)
	}

	//Handle Tabular Licensing
	if (recordSettings.licenseTable != "") {
		var ASITRowsArray = [];
		rLicChildArray = recordSettings.childLicense.split("/");
		rLicTable = loadASITable(recordSettings.licenseTable);
		for (x in rLicTable) {
			rVehData = rLicTable[x];
			if (rHasParent) {
				rChildVehId = createChild(rLicChildArray[0], rLicChildArray[1], rLicChildArray[2], rLicChildArray[3], null, itemCapId);
			} else {
				rChildVehId = createChild(rLicChildArray[0], rLicChildArray[1], rLicChildArray[2], rLicChildArray[3], null, rNewLicId);
			}
			if (rIssuedStatus != null && rIssuedStatus != "")
				updateAppStatus(rIssuedStatus, "", rChildVehId);

			rC1ExpResult = aa.expiration.getLicensesByCapID(rChildVehId).getOutput();

			//Get Next Expiration Date if using Expiration Code
			if (recordSettings.expirationType == "Expiration Code") {
				var rExpBiz = aa.proxyInvoker.newInstance("com.accela.aa.license.expiration.ExpirationBusiness").getOutput();
				rB1Model = rC1ExpResult.getB1Expiration();

				rNextDate = rExpBiz.getNextExpDate(rB1Model);
				rC1ExpResult.setExpDate(aa.date.parseDate(dateAdd(rNextDate, 0)));
			}

			if (recordSettings.expirationType == "Days") {
				rC1ExpResult.setExpDate(aa.date.parseDate(dateAdd(aa.util.now(), recordSettings.expirationPeriod)));
			}
			if (recordSettings.expirationType == "Function" && rCustomExpirationFunction != null && rCustomExpirationFunction != "") {
				var dateCalculationFuntion = rCustomExpirationFunction + "( rC1ExpResult )";
				var dateResult = eval("(" + dateCalculationFuntion + ")");
				if (dateResult instanceof Date) {
					rC1ExpResult.setExpDate(aa.date.parseDate(dateAdd(dateResult, 0)));
				}
			}

			rC1ExpResult.setExpStatus(rIssuedStatus);
			aa.expiration.editB1Expiration(rC1ExpResult.getB1Expiration());
			var ASITRow = UpdateASITRow(x, recordSettings.recordIdField, rChildVehId.getCustomID());
			ASITRowsArray.push(ASITRow);
			if (recordSettings.createLP && rNewLP != null && rNewLP.length > 0) {
				aa.licenseScript.associateLpWithCap(rChildVehId, rThisLP);
			}
		}

		if (rNewLicId && rNewLicId != null && rNewLicId != "") {
			if (ASITRowsArray.length > 0)
				updateASITColumns(ASITRowsArray, recordSettings.licenseTable);

			//// moved here because  the script update the ASIT on the application and need to copy the updated data to the license.
			if (recordSettings.copyCT)
				copyASITables(itemCapId, rNewLicId);
		}//rNewLicId is OK
	}
}
// this function update ASIT row with the new value
function UpdateASITRow(row, name, value) {
	var field = {};
	field.row = row;
	field.name = name;
	if (value == null) {
		value = "";
	}
	field.value = value;
	return field;

}
//this function check if the field is exists in the ASIT row
function hasField(fields, row, name) {

	var ret = false;
	for (x in fields) {
		var f = fields[x];
		if (f.row == row && f.name.toLowerCase() == name.toLowerCase()) {
			ret = true
			break;
		}
	}

	return ret;
}
// this function get the ASIT column value
function getASITFieldValue(fields, row, name) {
	var ret = null;
	for (x in fields) {
		var f = fields[x];
		if (f.row == row && f.name.toLowerCase() == name.toLowerCase()) {
			ret = f.value + "";
			break;
		}
	}
	return ret;
}
//this function to update the ASIT rows based on the new values
function updateASITColumns(asitRows, tableName) {

	if (asitRows.length == 0) {
		logDebug("**ERROR: : noting was sent to update");

	}
	//var tableName = asit.getTableName();
	if (tableName == "") {
		logDebug("ERROR: tableName cannot be Empty");
	}
	var tsm = aa.appSpecificTableScript.getAppSpecificTableModel(this.capId, tableName);
	if (!tsm.getSuccess()) {
		logDebug("ERROR: error retrieving app specific table " + tableName + " " + tsm.getErrorMessage());

	}

	var tsm = tsm.getOutput();
	var tsm = tsm.getAppSpecificTableModel();
	var cells = tsm.getTableField();
	var NumberOfCells = cells.size();
	var newtableFields = aa.util.newArrayList();
	var fields = tsm.getTableFields().iterator();
	var columns = aa.util.newArrayList();
	var columnScripts = tsm.getColumns();
	var NumberOfColumns = columnScripts.size();
	var NumberOfRows = Math.ceil(NumberOfCells / NumberOfColumns);

	if (NumberOfColumns < 0) {
		logDebug("invalid number of columns");
	}
	// set columns
	var colNames = [];
	for (var iterator = columnScripts.iterator(); iterator.hasNext();) {
		var scriptModel = iterator.next();
		columns.add(scriptModel.getColumnModel());
		colNames.push(scriptModel.getColumnName());
	}
	tsm.setColumns(columns);
	// set table fields
	var editedMsg = "";
	var edited = 0;
	for (var ri = 0; ri < NumberOfRows; ri++) {
		for (var colIndex = 0; colIndex < NumberOfColumns; colIndex++) {
			var cname = colNames[colIndex];
			var rowinIndexDB = fields.next().getRowIndex();
			var val = cells.get((ri * NumberOfColumns) + colIndex);
			if (hasField(asitRows, ri, cname)) {
				var newValue = getASITFieldValue(asitRows, ri, cname);
				editedMsg += "** " + cname + "[" + ri + "]=" + newValue + ", was " + val + "\n";
				val = newValue;
				edited++;

			}
			if (val == null) {
				val = "";
			}

			var res = aa.proxyInvoker.newInstance("com.accela.aa.aamain.appspectable.AppSpecificTableField", [ val, columns.get(colIndex) ]);
			if (!res.getSuccess()) {
				logDebug("field creationg failed: " + res.getErrorMessage());
			}
			field = res.getOutput();
			field.setFieldLabel(cname);
			field.setRowIndex(rowinIndexDB);
			newtableFields.add(field);

		}

	}
	if (edited != asitRows.length) {
		logDebug("ERROR: Could not edit all edited fields! only " + edited + "/" + asitRows.length + " was edited:\n" + editedMsg);
	}
	tsm.setTableFields(newtableFields);

	var gsiBiz = aa.proxyInvoker.newInstance("com.accela.aa.aamain.appspectable.AppSpecificTableBusiness").getOutput();
	gsiBiz.editAppSpecificTableInfos(tsm, this.capId, aa.getAuditID())
	logDebug("Successfully edited ASI Table: " + tableName + ". " + edited + " Cell(s) was edited:\n" + editedMsg);
	return edited;
}

/**
 * 
 * @param emailAddress
 * @param contactSeqNumber
 * @returns
 */
function getOrCreatePublicUser(emailAddress, contactSeqNumber) {

	var userModel = null;
	//check if exist
	var getUserResult = aa.publicUser.getPublicUserByEmail(emailAddress)
	if (getUserResult.getSuccess() && getUserResult.getOutput()) {
		userModel = getUserResult.getOutput();
		return userModel;
	}

	//create public User
	var capContact = aa.people.getCapContactByContactID(contactSeqNumber);
	if (!capContact.getSuccess()) {
		logDebug("**Warning getOrCreatePublicUser :: getCapContactByContactID " + contactSeqNumber + "  failure: " + capContact.getErrorMessage());
		return null;
	}
	capContact = capContact.getOutput();
	if (capContact.length == 0) {
		return null;
	}
	capContact = capContact[0];
	var thisContactRefId = capContact.getCapContactModel().getRefContactNumber();

	var publicUser = aa.publicUser.getPublicUserModel();
	publicUser.setFirstName(capContact.getFirstName());
	publicUser.setLastName(capContact.getLastName());
	publicUser.setEmail(capContact.getEmail());
	publicUser.setUserID(capContact.getEmail());
	publicUser.setPassword("e8248cbe79a288ffec75d7300ad2e07172f487f6"); //password : 1111111111
	publicUser.setAuditID("PublicUser");
	publicUser.setAuditStatus("A");
	publicUser.setCellPhone(capContact.getPeople().getPhone2());

	var result = aa.publicUser.createPublicUser(publicUser);
	if (result.getSuccess()) {

		var userSeqNum = result.getOutput();
		userModel = aa.publicUser.getPublicUser(userSeqNum).getOutput()

		// create for agency
		aa.publicUser.createPublicUserForAgency(userModel);

		// activate for agency
		var userPinBiz = aa.proxyInvoker.newInstance("com.accela.pa.pin.UserPINBusiness").getOutput()
		userPinBiz.updateActiveStatusAndLicenseIssueDate4PublicUser(servProvCode, userSeqNum, "ADMIN");

		// reset password
		var resetPasswordResult = aa.publicUser.resetPassword(emailAddress);
		if (resetPasswordResult.getSuccess()) {
			var resetPassword = resetPasswordResult.getOutput();
			userModel.setPassword(resetPassword);
		} else {
			logDebug("**WARN: getOrCreatePublicUser ::  Reset password for  " + capContact.getEmail() + "  failure:" + resetPasswordResult.getErrorMessage());
		}

		// send Activate email
		aa.publicUser.sendActivateEmail(userModel, true, true);

		// send another email
		aa.publicUser.sendPasswordEmail(userModel);
	} else {
		logDebug("**Warning getOrCreatePublicUser ::  create publicUser " + capContact.getEmail() + "  failure: " + result.getErrorMessage());
		return null;
	}

	//  Now that we have a public user let's connect to the reference contact		
	if (thisContactRefId) {
		aa.licenseScript.associateContactWithPublicUser(userModel.getUserSeqNum(), thisContactRefId);
	}
	return userModel;
}

function isLicenseConnectedToPublicUser(userNum, licenseNum) {
	try {
		var userSeqList = aa.util.newArrayList();
		userSeqList.add(userNum);
		var contractorLicenseBiz = aa.proxyInvoker.newInstance("com.accela.pa.people.license.ContractorLicenseBusiness").getOutput()
		var licenses = contractorLicenseBiz.getContrLicListByUserSeqNBR(userNum, aa.getServiceProviderCode()); // Array List
		if (licenses) {
			licArr = licenses.toArray();
			for (lIndex in licArr) {
				thisLic = licArr[lIndex];
				licModel = thisLic.getLicense();
				licNumber = licModel.getStateLicense();
				if (licNumber == licenseNum)
					return true;
			}
		}
	} catch (err) {
		logDebug(err);
		return false;
	}
	return false;
}

function associateLPToPublicUser(licenseNum, userNum) {
	var licResult = aa.licenseScript.getRefLicensesProfByLicNbr(aa.getServiceProviderCode(), licenseNum);
	if (licResult.getSuccess()) {
		var licObj = licResult.getOutput();
		if (licObj != null) {
			licObj = licObj[0];
			puResult = aa.publicUser.getPublicUser(userNum);
			if (puResult.getSuccess()) {
				pu = puResult.getOutput();
				if (pu != null) {
					assocResult = aa.licenseScript.associateLpWithPublicUser(pu, licObj);
					if (!assocResult.getSuccess())
						logDebug("**WARN associateLPToPublicUser :: Link failed " + licenseNum + " : " + assocResult.getErrorMessage());
				} else {
					logDebug("associateLPToPublicUser :: Public user object is null");
				}
			} else {
				logDebug("Error associateLPToPublicUser :: getting public user account " + puResult.getErrorMessage());
			}
		} else {
			logDebug("associateLPToPublicUser :: lp object is null");
		}
	} else {
		logDebug("Error associateLPToPublicUser :: " + licResult.getErrorMessage());
	}
}
