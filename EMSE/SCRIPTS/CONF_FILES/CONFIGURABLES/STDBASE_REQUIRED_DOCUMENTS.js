/*

Title : Check Required And Conditional Documents
Purpose : TO Check Required And Conditional Documents
Author: Haetham Eleisah
Functional Area : ACA,AV Events
Description : JSON Example : 

{
  "Marijuana/Retail/Retail Store/Renewal": {
    "ApplicationSpecificInfoUpdateBefore": [
      {
        "preScript": " ",
        "metadata": {
          "description": "required document",
          "operators": {
            
          }
        },
        "criteria": {
          "customLists": {
            "CUSTOM LIST/Item Numer": "12345",
            "CUSTOM LIST/Item Description": "haetham",
            
          },
          "contactFields": {
            "contactType": "Applicant"
          },
          "lpFields": {
            "licType": "Engineer",
            
          },
          "customFields": {
            "Job Value": "100",
            "Code": "KBC 2012"
          },
          "addressFields": {
            "zip": "12345",
            
          },
          "parcelFields": {
            "ParcelNumber": "00800"
          }
          
        },
        "action": {
          "requiredDocuments": [
            "Photos",
            "Trade Names"
          ],
          "requirementType": "CONDITIONAL",
          "validationMessage":"Please upload required documents: "
        },
        "postScript ": " "
      }
    ]
  }
}

Available Types: contactFields, customFields, customLists, parcelFields, addressFields, lpFields

Available Attributes for each type: 
- Custom Fields and Custom Lists: ALL
- Address: All Custom Attributes, (primaryFlag,houseNumberStart,streetDirection,streetName,streetSuffix,city,state,zip,addressStatus,county,country,addressDescription,xCoordinate,yCoordinate)
- Parcel: All Custom Attributes, (ParcelNumber,Section,Block,LegalDesc,GisSeqNo,SourceSeqNumber,Page,I18NSubdivision,CouncilDistrict,RefAddressTypes,ParcelStatus,ExemptValue,PublicSourceSeqNBR,CensusTract,InspectionDistrict,NoticeConditions,ImprovedValue,PlanArea,Lot,ParcelArea,Township,LandValue)
- Licensed Professional: All Custom Attributes, (licType,lastName,firstName,businessName,address1,city,state,zip,country,email,phone1,phone2,lastRenewalDate,licExpirationDate,FEIN,gender,birthDate)
- Contact: All Custom Attributes, (firstName,lastName,middleName,businessName,contactSeqNumber,contactType,relation,phone1,phone2,email,addressLine1,addressLine2,city,state,zip,fax,notes,country,fullName,peopleModel)
 */
try {

	eval(getScriptText("CONFIGURABLE_SCRIPTS_COMMON"));
	var settingsArray = [];
	var scriptSuffix = "REQUIRED_DOCUMENTS";
	isConfigurableScript(settingsArray, scriptSuffix);
	var requiredDocuments;
	var requirementType;
	var validationMessage;
	for (s in settingsArray) {
		var rules = settingsArray[s];
		var preScript = rules.preScript;
		var postScript = rules.postScript;
		requiredDocuments = rules.action.requiredDocuments;
		requirementType = rules.action.requirementType;
		validationMessage = rules.action.validationMessage;
		/// check if the rules on conditional and the user in AV
		if (requirementType == "CONDITIONAL" && !isPublicUser)
			break;

		// run preScript
		if (!isEmptyOrNull(preScript)) {
			eval(getScriptText(preScript, null, false));
		}
		if (cancelCfgExecution) {
			logDebug("**WARN STDBASE Script [" + scriptSuffix + "] canceled by cancelCfgExecution");
			cancelCfgExecution = false;
			continue;
		}
		// this to clear the required document if the rule was not passed
		if (requirementType == "CONDITIONAL") {
			removeAllRequiredDocumentCapCondition();
		}
		/// this to check if all Rules  if is matched.

		ValidateDocument();

		if (!isEmptyOrNull(postScript)) {
			eval(getScriptText(postScript, null, false));
		}
	}

} catch (ex) {

	logDebug("**ERROR: Exception while verifying the rules for " + scriptSuffix + ". Error: " + ex);
}

/// this function will validate documents based on the rules in the JSON.
function ValidateDocument() {
	// this when rules is matched;

	var submittedDocArray = aa.document.getCapDocumentList(capId, currUserId).getOutput();
	if (submittedDocArray == null || submittedDocArray.length == 0) {
		submittedDocArray = aa.document.getDocumentListByEntity(capId, "TMP_CAP").getOutput().toArray();
	}

	var DocumentsArray = requiredDocuments;
	var documentExists = false;

	if (requirementType == "CONDITIONAL" && isPublicUser) {
		for ( var d in DocumentsArray) {
			addConditionMultiLanguage(DocumentsArray[d], DocumentsArray[d]);
		}
		documentExists = true;
	} else if (requirementType == "STANDARD") {
		for ( var d in DocumentsArray) {
			for ( var i in submittedDocArray) {
				if (submittedDocArray[i].getDocCategory() == DocumentsArray[d]) {
					documentExists = true;
					break;

				} else {
					documentExists = false;

				}

			}

		}

	}
	if (!documentExists) {
		var msg = "these document are required :" + DocumentsArray;
		if (!isEmptyOrNull(validationMessage))
			msg = validationMessage;

		cancel = true;
		showMessage = true;
		if (isPublicUser) {
			aa.env.setValue("ErrorCode", "1");
			aa.env.setValue("ErrorMessage", msg);
			comment(msg);
		} else {

			comment(msg);
		}

	}

}
