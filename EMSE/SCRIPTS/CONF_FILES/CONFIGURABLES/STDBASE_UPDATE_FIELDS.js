/*Title : Update Fields
Purpose : To Update custom fields (ASI/ASIT) based on several rules
Author: Haetham Eleisah
Functional Area : workflow events,inpsection result or document upload events.
Description : JSON Example :
{
  "Marijuana/Retail/Retail Store/Renewal": {
    "WorkflowTaskUpdateAfter": [
      {
        "preScript": "",
        "metadata": {
          "description": "update fields",
          "operators": {
             
          }
        },
        "criteria": {
          "customFields": {
            "Trade Name": "test"
          },
          "customLists": {
            "OWNERSHIP INFORMATION/Name": "33",
            
          },
          "task": [
            
          ],
          "status": [
           
          ],
          
        },
        "action": {
          "valueSource": " ",
          "sourceName": "ACA_CONFIGS/AGENCY_NAME",
          "customFieldToUpdate": "EIN#",
          "customListToUpdate": "TESTHAETHAM/TestHaetham",
          
        },
        "postScript": ""
      }
    ]
  }
}
Available Types: customFields, customLists
Available Attributes for each type:
- Custom Fields and Custom Lists: ALL

Note : for the source name when the value source is standard comments then the source name should be "comment type/comment ID"
and when the source is standard choice the source name will be standard choice / standard choice value.

 */

try {
	// This should be included in all Configurable Scripts
	eval(getScriptText("CONFIGURABLE_SCRIPTS_COMMON"));
	var settingsArray = [];
	var scriptSuffix = "UPDATE_FIELDS";
	isConfigurableScript(settingsArray, scriptSuffix);

	for (s in settingsArray) {
		var rules = settingsArray[s];
		var preScript = rules.preScript;
		var postScript = rules.postScript;

		// run preScript
		if (!isEmptyOrNull(preScript)) {
			eval(getScriptText(preScript, null, false));
		}
		if (cancelCfgExecution) {
			logDebug("**WARN STDBASE Script [" + scriptSuffix + "] canceled by cancelCfgExecution");
			cancelCfgExecution = false;
			continue;
		}
		UpdateFields(rules.action);

		// / run post script
		if (!isEmptyOrNull(postScript)) {
			eval(getScriptText(postScript, null, false));
		}
	}

} catch (ex) {

	logDebug("**ERROR: Exception while verifying the rules for " + scriptSuffix + ". Error: " + ex);
}

/**
 * this function will update ASI or ASIT column  based on the json rules
 * @param rules json rules .
 */
function UpdateFields(rules) {
	var newValue = getNewValue(rules);
	if (rules.customFieldToUpdate != null && rules.customFieldToUpdate != "") {
		editAppSpecific(rules.customFieldToUpdate, newValue);
	}
	if (rules.customListToUpdate != null && rules.customListToUpdate != "") {
		UpdateAsitTableColumn(rules.customListToUpdate, newValue)
	}
}
/**
 * this function will get the new value to update the asi/asit column based on the source
 * @param rules
 * @returns
 */
function getNewValue(rules) {
	if (rules.valueSource.trim() == "") {
		return rules.sourceName;
	} else if (rules.valueSource == "Standard Choice") {
		var stdValues = rules.sourceName.split("/");
		if (stdValues.length == 2) {
			var result = aa.bizDomain.getBizDomainByValue(stdValues[0], stdValues[1]).getOutput();

			if (result != null) {
				return result.getDescription();
			} else {
				return "";
			}
		}
	} else if (rules.valueSource == "Standard Comments") {
		var result = aa.cap.getStandardComment(null).getOutput();
		var stdComments = rules.sourceName.split("/");
		if (stdComments.length == 2) {
			for ( var ix in result) {
				if (result[ix].getCommentType() == stdComments[0] && stdComments[1] == result[ix].getDocID())
					return result[ix].getName();
			}
		}
	}
}
/**
 * this function will update ASIT column
 * @param customListDetails ASIT details 
 * @param newValue new column value
 */
function UpdateAsitTableColumn(customListDetails, newValue) {
	var asitDetails = customListDetails.split("/");
	if (asitDetails.length == 2) {
		var tableName = asitDetails[0];
		var columnName = asitDetails[1];
		var oldASITArray = loadASITable(tableName);
		for ( var i in oldASITArray) {
			oldASITArray[i][columnName] = newValue;

		}

		removeASITable(tableName);
		addASITable(tableName, oldASITArray)
	}
}
