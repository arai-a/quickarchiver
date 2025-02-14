let quickarchiverDialog = {
    params: {},
    onLoad: function () {
        quickarchiverStorage.init();
        this.params = window.arguments[0];

        if (this.params.sent.field) {
            document.getElementById("field").selectedItem = document.getElementById(this.params.sent.field);
        }

        document.getElementById("desc-folder").value = this.params.sent.folderPath;

        this.switchRadio();

        // handle events

        document.addEventListener("dialogaccept", function (event) {
            quickarchiverDialog.send();
        });
        document.addEventListener("dialogextra1", function (event) {
            quickarchiverDialog.deleteRule();
        });

    },
    deleteRule: function () {

       this.send("delete");
       window.close();
    },
    send: function (action) {

        if (typeof(action) == "undefined") {
            action = "update";
        }

        window.arguments[0].returned = {
            value: document.getElementById("value").value,
            field: document.getElementById("field").selectedItem.value,
            action: action
        };

        return true;
    },
    switchGroup: function () {

        if (document.getElementById("custom").checked) {
            document.getElementById("value").disabled = false;
            document.getElementById("value-label").disabled = false;
        } else {
            document.getElementById("value").disabled = true;
            document.getElementById("value-label").disabled = true;
        }
    },
    switchRadio: function () {

        var field = document.getElementById("field").selectedItem.value;

        var params = window.arguments[0];

        switch (field) {

            case "to" :
                document.getElementById("value").value = params.sent.to;
                break;
            case "from" :
                document.getElementById("value").value = params.sent.from;
                break;
            case "subject" :
                document.getElementById("value").value = params.sent.subject;
                break;
        }
    }
};

