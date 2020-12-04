/**
 * Column functions that are independed from DB table creation.
 * @param {Table} table - Instance of Table class.
 * @param {string} type - Column type.
 * @param {string} name - Column name.
 * @param {object} options - Additional options available for a column.
 */
function dbIndependentColumnOpts(table, type, name, options) {
    if(options.references && typeof options.references === "string") {
        // Check the reference string.
        const refArr = options.references.split("."); // Split the string to separate table for column name.
        if(refArr.length > 2 || refArr.length < 2) throw new Error(`[Table ${table.name}] Bad reference for "${name}"! "${options.references}" is not valid input.`);

        // Check the reference table.
        const refTableName = table.manager.prefix + refArr[0]; // Formatted name for the column and how it would appear in the DB + Mapped references.
        const refTable = table.manager.tables.get(refTableName);
        if(!refTable) throw new Error(`[Table ${table.name}] Bad reference for "${name}"! "${refTableName}" doesn't exist.`);

        // Check the reference column.
        const refColumn = refTable.columns[refArr[1]]; // Referenced column's data.
        if(!refColumn) throw new Error(`[Table ${table.name}] Bad reference for "${name}"! "${refTableName}.${refArr[1]}" doesn't exist.`);
        if(typeof refColumn === "string") {
            if(!(refColumn === "increment" && type === "integer") && refColumn !== type) throw new Error(`[Table ${table.name}] Bad reference for "${name}"! "${refTableName}.${refArr[1]}" is type "${refColumn === "increment" ? "integer" : refColumn}", not "${type}".`);
        } else { // If column is an object, must check it's type key instead of the column itself.
            if(!(refColumn.type === "increment" && type === "integer") && refColumn.type !== type) throw new Error(`[Table ${table.name}] Bad reference for "${name}"! "${refTableName}.${refArr[1]}" is type "${refColumn.type === "increment" ? "integer" : refColumn.type}", not "${type}".`);
        }

        let refTableArr = refTable.referenced.get(refArr[1]); // Get the referenced column from the referenced table's referenced map.
        if(refTableArr) // If it has a value, then we want to push this column to the array.
            refTableArr.push({table: table, column: name});
        else refTableArr = [{table: table, column: name}];
        refTable.referenced.set(refArr[1], refTableArr);

        let thisTableArr = table.references.get(name) // Get the referencing column from our table's references map.
        if(thisTableArr) // If it has a value, then we want to push the referenced column to the array.
            thisTableArr.push({table: refTable, column: refArr[1]});
        else thisTableArr = [{table: refTable, column: refArr[1]}];
        table.references.set(name, thisTableArr);
    }

    if(options.updateDate && (type === "timestamp" || type === "date")) {
        table.lastModified = name;
    }
}

/**
 * Column gen function.
 * ? You guys won't murder me for this... Right? 
 * @param {Table} table - Instance of Table class.
 * @param {function} colGen - Column gen object.
 * @param {string} type - Column type.
 * @param {string} name - Column name.
 * @param {object} options - Additional options available for a column.
 */
function tableColumnGen(table, colGen, type, name, options) {
    let res;
    switch (type) { // TODO: Add decimals.
        case "increment":
            res = colGen.increments(name);
            table.primary = {name, type, auto: true};
            break;
    
        case "string":
            res = colGen.string(name);
            break;

        case "integer":
            res = colGen.integer(name);
            break;

        case "float":
            res = colGen.float(name);
            break;

        case "boolean":
            res = tablcolGene.boolean(name);
            break;

        case "json":
            res = colGen.json(name);
            break;

        case "jsonb":
            res = colGen.jsonb(name);
            break;

        case "timestamp":
            res = colGen.timestamp(name);
            break;

        case "date":
            res = colGen.date(name);
            break;

        case "uuid":
            res = colGen.uuid(name);
            break;

        default: // F**k decimals for now.
            throw new Error(`[Table ${table.name}] Can't set property "${name}" to "${type}! This type doesn't exist.`);
    }

    if(options) {
        if(options.primary) {
            res = res.primary();
            table.primary = {name, type, auto: type === "increment" ? true : false};
        }

        if(options.unsigned) {
            res = res.unsigned();
        }

        if(options.unique) {
            res = res.unique();
        }

        if(options.references && typeof options.references === "string") {
            res = res.references(table.manager.prefix+options.references);
        }

        if(options.defaultTo) {
            if(options.defaultTo === "now" && (type === "timestamp" || type === "date"))
                res = res.defaultTo(table.db.fn.now());
            else {
                switch (type) { // A little bit of type checking~!
                    case "integer":
                    case "float":
                    case "increment":
                        if(typeof options.defaultTo === "number")
                            res = res.defaultTo(options.defaultTo);
                        else throw new Error(`[Table ${table.name}] Bad default! "${name}" type is "${type}", not "${typeof options.defaultTo}".`);
                        break;

                    case "string":
                        if(typeof options.defaultTo === "string")
                            res = res.defaultTo(options.defaultTo);
                        else throw new Error(`[Table ${table.name}] Bad default! "${name}" type is "${type}", not "${typeof options.defaultTo}".`);
                
                    default:
                        res = res.defaultTo(options.defaultTo);
                        break;
                }
            }
        }

        if(options.notNull) {
            res = res.notNullable();
        } else if(type !== "increment" || options.primary) {
            res = res.nullable();
        }
    }
}

// TODO: Add functions to retrieve and set data.
class Table {
    /**
     * Table instance for managing a DB.
     * @param {DataBase} dbManager - DataBase instance.
     * @param {object} table_options - Options for the table.
     * @param {string} table_options.name - Name of the table.
     * @param {object} table_options.columns - JSON containing all the columns for the table.
     */
    constructor(dbManager, table_options = {name, columns: {}}) {
        // Lots of checks! :3
        if(!dbManager) throw new Error("Database manager missing! Was this called outside of it?");
        if(!table_options || typeof table_options !== "object") throw new Error("Table options are missing!");
        if(!table_options.name || typeof table_options.name !== "string") throw new Error("No valid name was passed! Make sure to pass a string as a name.");
        if(dbManager.tables.get(table_options.name)) throw new Error(`A table named "${table_options.name}" already exists!`);
        if(!table_options.columns || typeof table_options.columns !== "object") throw new Error("No columns are provided!");

        // Variables
        this.manager = dbManager;
        this.db = dbManager.db;
        this.name = this.manager.prefix + table_options.name;
        this.basename = table_options.name;
        this.columns = table_options.columns;
        this.manager.tables.set(this.name, this);

        // More column specific variables.
        this.primary = null;
        this.referenced = new Map();
        this.references = new Map();
        this.lastModified = null;

        this.linkColumns();
    }

    /**
     * Links the columns if DB table creation isn't to be called.
     */
    linkColumns() {
        for (const name in this.columns) {
            if (this.columns.hasOwnProperty(name)) {
                const element = this.columns[name];
                if(typeof element === "object")
                    dbIndependentColumnOpts(this, element.type, name, element);
            }   
        }
    }

    /**
     * Creates the DB table.
     */
    async create() {
        await this.db.schema.createTable(this.name, colGen => {
            for (const name in this.columns) {
                if (this.columns.hasOwnProperty(name)) {
                    const element = this.columns[name];
                    if(typeof element === "object")
                        tableColumnGen(this, colGen, element.type, name, element);
                    else
                        tableColumnGen(this, colGen, element, name);
                }
            }
        });

        return;
    }
}

module.exports = {
    Table
};