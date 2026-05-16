import { TT, Token, Loc, Literal, Expression, Attr, Child, CompUse, IfBlock, ForLoop, RemoveStmt, ReturnStmt, ParamDecl, StyleBlock, ScriptBlock, CompDef, CustomElDecl, VarDeclaration, ImportNode, MetaEntry, FunctionDef, SinthFile, SinthError, SinthWarning, AssignOp, VarType, BinaryOp } from "./types.ts";
import { Lexer } from "./lexer.ts";
import { compileExprToJS, compileIfToJS } from "./expr.ts";
import { tagNameToPascal } from "../utils.ts";



export class Parser {
  private pos     = 0;
  private loopVar: string | null = null;
  private _varDecls: VarDeclaration[] = [];

  constructor(private tokens: Token[], private file: string) {}


  parse(): SinthFile {
    let   isPage   = false;
    const imports:   ImportNode[]    = [];
    const meta:      MetaEntry[]     = [];
    const defs:      CompDef[]       = [];
    const functions: FunctionDef[]   = [];
    const uses:      CompUse[]       = [];
    const styles:    StyleBlock[]    = [];
    const scripts:   ScriptBlock[]   = [];
    const customEls: CustomElDecl[]  = [];
    const varDecls:  VarDeclaration[] = [];
    this._varDecls = varDecls;

    if (this.check(TT.KW_PAGE)) { this.consume(TT.KW_PAGE); isPage = true; }

    while (this.check(TT.KW_IMPORT)) imports.push(this.parseImport());

    while (this.isMetaStart()) {
      const entry = this.parseMeta();
      meta.push(entry);
      if (entry.key === "title") isPage = true;
    }


    while (this.check(TT.IDENT) && this.peek().value === "var") {
      const vd = this.parseVarDeclaration();
      if (vd) { varDecls.push(vd); }
    }


    while (!this.check(TT.EOF)) {
      if      (this.check(TT.KW_COMPONENT))                     { defs.push(this.parseCompDef()); }
      else if (this.check(TT.KW_FUNCTION))                      { functions.push(this.parseFunctionDef()); }  // ← new
      else if (this.check(TT.KW_STYLE))                         { styles.push(this.parseStyleBlock()); }
      else if (this.check(TT.KW_SCRIPT))                        { scripts.push(this.parseScriptBlock()); }
      else if (this.check(TT.KW_CUSTOM_EL) || this.check(TT.KW_CUSTOM)) { customEls.push(this.parseCustomEl()); }
      else if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) varDecls.push(vd);
      }
      else if (this.check(TT.KW_IF)) {
        const ifNode = this.parseIfBlock();
        uses.push(...this.flattenIfToUses(ifNode, scripts));
      }
      else if (this.check(TT.KW_FOR)) {
        const forNode = this.parseForLoop();
        uses.push({ kind: "use", name: "__IF_ROOT__", attrs: [], children: [forNode], loc: forNode.loc });
      }
      else if (this.check(TT.LPAREN)) {
        const loc = this.peek().loc;
        this.consume(TT.LPAREN);
        const expr = this.parseExpression();
        if (!expr) throw new SinthError("Expected expression after '('", loc);
        if (!this.check(TT.RPAREN)) throw new SinthError("Expected ')'", loc);
        this.consume(TT.RPAREN);
        uses.push({ kind: "use", name: "__IF_ROOT__", attrs: [], children: [{ kind: "expr", expression: expr, loc }], loc });
      }
else if (this.check(TT.IDENT)) {
const savedPos = this.pos;
const identName = this.peek().value;
const nextType  = this.tokens[this.pos + 1]?.type;

// detect accidental top-level expressions (guess == target" instead of "if guess == target")
const isComparison = [TT.OP_EQEQ, TT.OP_NEQ, TT.OP_LT, TT.OP_GT, TT.OP_LTEQ, TT.OP_GTEQ].includes(nextType);
const isLogicAndOr = nextType === TT.IDENT && (this.tokens[this.pos + 1]?.value === "and" || this.tokens[this.pos + 1]?.value === "or");

if (isComparison || isLogicAndOr) {
    throw new SinthError(
        `Unexpected expression '${identName} ...' at top level. Did you mean to wrap this in an 'if' block?`,
        this.peek().loc,
    );
}

// top-level assignment: ident = expr
if (nextType === TT.EQUALS ||
(nextType === TT.OP_PLUS  && this.tokens[this.pos + 2]?.type === TT.EQUALS) ||
(nextType === TT.OP_MINUS && this.tokens[this.pos + 2]?.type === TT.EQUALS)) {
    this.consume(TT.IDENT); // consume name
    let op: AssignOp = "=";
    if      (this.check(TT.OP_PLUS))  { this.consume(TT.OP_PLUS);  op = "+="; }
    else if (this.check(TT.OP_MINUS)) { this.consume(TT.OP_MINUS); op = "-="; }
    this.consume(TT.EQUALS);
    const expr = this.parseExpression();
    if (expr) {
        const js = `${identName} ${op} ${compileExprToJS(expr)};
sinthRender();`;
        scripts.push({ raw: js, attrs: {}, loc: this.peek().loc });
    }
    continue;
}

// component usage
this.pos = savedPos;
uses.push(this.parseCompUse());
}
      else throw new SinthError(
        `Unexpected token '${this.peek().value}' (${TT[this.peek().type]}) at top level`,
        this.peek().loc,
      );
    }

    return { filePath: this.file, isPage, imports, meta, defs, functions, uses, styles, scripts, customEls, varDecls };
  }

  private flattenIfToUses(ifNode: IfBlock, scripts: ScriptBlock[]): CompUse[] {
    const bodyHasComp  = ifNode.body.some(c => c.kind === "use");
    const elseHasComp  = (ifNode.elseBody ?? []).some(c => c.kind === "use");
    if (!bodyHasComp && !elseHasComp) {
      scripts.push({ raw: compileIfToJS(ifNode), attrs: {}, loc: ifNode.loc });
      return [];
    }
    const syntheticUse: CompUse = {
      kind: "use",
      name: "__IF_ROOT__",
      attrs: [],
      children: [ifNode],
      loc: ifNode.loc,
    };
    return [syntheticUse];
  }

  // imports

  private parseImport(): ImportNode {
    const loc = this.consume(TT.KW_IMPORT).loc;
    if (this.check(TT.KW_CSS)) {
      this.consume(TT.KW_CSS);
      return { kind: "css", path: this.consume(TT.STRING).value, loc };
    }
    if (this.check(TT.STRING)) {
      return { kind: "sinth", path: this.consume(TT.STRING).value, loc };
    }
    if (this.check(TT.IDENT)) {
      const name = this.consume(TT.IDENT).value;
      let alias: string | undefined;
      if (this.check(TT.KW_AS)) { this.consume(TT.KW_AS); alias = this.consume(TT.IDENT).value; }
      return { kind: "js", name, alias, loc };
    }
    throw new SinthError(`Expected import path, library name, or 'css'`, loc);
  }

  // metadata

  private isMetaStart(): boolean {
    if (!this.check(TT.IDENT)) return false;
    return this.tokens[this.pos + 1]?.type === TT.EQUALS;
  }

  private parseMeta(): MetaEntry {
    const loc = this.peek().loc;
    const key = this.consume(TT.IDENT).value;
    this.consume(TT.EQUALS);
    return { key, value: this.parseLiteral(), loc };
  }

  // var declarations

  private parseVarDeclaration(): VarDeclaration | null {
    const loc = this.peek().loc;
    this.consume(TT.IDENT); // consume 'var'

    const typeTok = this.consume(TT.IDENT);
    let typeStr = typeTok.value;
    if (this.check(TT.LBRACKET) && this.tokens[this.pos + 1]?.type === TT.RBRACKET) {
      this.consume(TT.LBRACKET); this.consume(TT.RBRACKET);
      typeStr = "str[]";
    }
    if (!["int", "str", "bool", "str[]", "obj", "ui"].includes(typeStr)) {
      throw new SinthError(`Unknown type '${typeStr}'. Expected: int, str, bool, str[], obj, component`, typeTok.loc);
    }

    const nameTok = this.consume(TT.IDENT);
    let val: Literal | null = null;

    if (this.check(TT.EQUALS)) {
      this.consume(TT.EQUALS);
      if (this.check(TT.LBRACKET)) {
        val = this.parseArrayLiteral();
      } else if (this.check(TT.IDENT)) {
        const refName = this.consume(TT.IDENT).value;
        val = { kind: "str", value: `__VAR__${refName}` };
      } else {
        val = this.parseLiteral();
      }
    }

    return { kind: "var", name: nameTok.value, varType: typeStr as VarType, value: val, loc };
  }

private parseArrayLiteral(): Literal {
    this.consume(TT.LBRACKET);
    const items: any[] = [];
    while (!this.check(TT.RBRACKET) && !this.check(TT.EOF)) {
      if (this.check(TT.LBRACE)) {
        items.push(this.parseObjectLiteral());
      } else if (this.check(TT.STRING)) {
        items.push(this.consume(TT.STRING).value);
      } else if (this.check(TT.NUMBER)) {
        items.push(parseFloat(this.consume(TT.NUMBER).value));
      } else if (this.check(TT.BOOL_TRUE)) {
        this.consume(TT.BOOL_TRUE);
        items.push(true);
      } else if (this.check(TT.BOOL_FALSE)) {
        this.consume(TT.BOOL_FALSE);
        items.push(false);
      } else if (this.check(TT.NULL_LIT)) {
        this.consume(TT.NULL_LIT);
        items.push(null);
      }
      if (this.check(TT.COMMA)) this.consume(TT.COMMA); else break;
    }
    this.consume(TT.RBRACKET);
    return { kind: "str", value: `__ARR__${JSON.stringify(items)}` };
  }

  private parseObjectLiteral(): Record<string, any> {
    this.consume(TT.LBRACE);
    const obj: Record<string, any> = {};
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      const key = this.consume(TT.IDENT).value;
      this.consume(TT.COLON);
      if (this.check(TT.STRING)) {
        obj[key] = this.consume(TT.STRING).value;
      } else if (this.check(TT.NUMBER)) {
        obj[key] = parseFloat(this.consume(TT.NUMBER).value);
      } else if (this.check(TT.BOOL_TRUE)) {
        this.consume(TT.BOOL_TRUE);
        obj[key] = true;
      } else if (this.check(TT.BOOL_FALSE)) {
        this.consume(TT.BOOL_FALSE);
        obj[key] = false;
      } else if (this.check(TT.NULL_LIT)) {
        this.consume(TT.NULL_LIT);
        obj[key] = null;
      } else {
        throw new SinthError(`Expected literal value for key '${key}'`, this.peek().loc);
      }
      if (this.check(TT.COMMA)) this.consume(TT.COMMA);
    }
    this.consume(TT.RBRACE);
    return obj;
  }

  // expression parsing

  parseExpression(): Expression | null {
    const tok = this.peek();

    // Unary 'not'
    if ((tok.type === TT.IDENT && tok.value === "not") || tok.type === TT.OP_NOT) {
      if (tok.type === TT.IDENT) this.consume(TT.IDENT); else this.consume(TT.OP_NOT);
      const operand = this.parseExpression();
      if (!operand) throw new SinthError("Expected expression after 'not'", tok.loc);
      const unaryExpr: Expression = { kind: "unary", op: "not", operand };
      return this.parseBinaryRHS(this.parseCallExpr(this.parsePostfix(unaryExpr)));
    }

    if (this.check(TT.LPAREN)) {
      this.consume(TT.LPAREN);
      const inner = this.parseExpression();
      if (!inner) throw new SinthError("Expected expression after '('", this.peek().loc);
      if (!this.check(TT.RPAREN)) throw new SinthError("Expected closing ')'", this.peek().loc);
      this.consume(TT.RPAREN);
      return this.parseBinaryRHS(this.parseCallExpr(this.parsePostfix(inner)));
    }

    // literal
    if (this.check(TT.STRING) || this.check(TT.NUMBER) || this.check(TT.BOOL_TRUE) ||
        this.check(TT.BOOL_FALSE) || this.check(TT.NULL_LIT)) {
      const lit = this.parseLiteral();
      const base: Expression = { kind: "literal", value: lit };
      return this.parseBinaryRHS(this.parseCallExpr(this.parsePostfix(base)));
    }

    // var or assignment
    if (tok.type === TT.IDENT) {
      const name = this.consume(TT.IDENT).value;
      let varExpr: Expression;

      // dot notation -> user.age
      if (this.check(TT.DOT)) {
        this.consume(TT.DOT);
        const propName = this.consume(TT.IDENT).value;
        const fullName = `${name}.${propName}`;
        varExpr = { kind: "variable", name: fullName };
      } else {
        varExpr = { kind: "variable", name };
      }

      // apply bracket postfixes (e.g. data[key], data["x"])
      const indexedExpr = this.parsePostfix(varExpr);

      // if indexing was applied, we don't allow assignment, just binary RHS (after possible call)
      if (indexedExpr !== varExpr) {
        return this.parseBinaryRHS(this.parseCallExpr(indexedExpr));
      }

      // no indexing – check for assignment operators
      const nextType = this.tokens[this.pos]?.type;
      if (nextType === TT.OP_PLUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
        this.consume(TT.OP_PLUS); this.consume(TT.EQUALS);
        const rhs = this.parseExpression();
        if (!rhs) throw new SinthError("Expected expression after +=", this.peek().loc);
        return { kind: "assign", target: varExpr.name!, op: "+=", right: rhs };
      }
      if (nextType === TT.OP_MINUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
        this.consume(TT.OP_MINUS); this.consume(TT.EQUALS);
        const rhs = this.parseExpression();
        if (!rhs) throw new SinthError("Expected expression after -=", this.peek().loc);
        return { kind: "assign", target: varExpr.name!, op: "-=", right: rhs };
      }
      if (nextType === TT.EQUALS) {
        this.consume(TT.EQUALS);
        const rhs = this.parseExpression();
        if (!rhs) throw new SinthError("Expected expression after =", this.peek().loc);
        return { kind: "assign", target: varExpr.name!, op: "=", right: rhs };
      }

      return this.parseBinaryRHS(this.parseCallExpr(varExpr));
    }

    return null;
  }

  private parseBinaryRHS(left: Expression): Expression {
    const t = this.peek().type;
    let op: BinaryOp | null = null;
    if      (t === TT.OP_EQEQ)  op = "==";
    else if (t === TT.OP_NEQ)   op = "!=";
    else if (t === TT.OP_LT)    op = "<";
    else if (t === TT.OP_GT)    op = ">";
    else if (t === TT.OP_LTEQ)  op = "<=";
    else if (t === TT.OP_GTEQ)  op = ">=";
    else if (t === TT.OP_PLUS)  op = "+";
    else if (t === TT.OP_MINUS) op = "-";
    else if (t === TT.OP_STAR)  op = "*";
    else if (t === TT.OP_SLASH) op = "/";
    else if (t === TT.IDENT && this.peek().value === "and") op = "and";
    else if (t === TT.IDENT && this.peek().value === "or")  op = "or";

    if (!op) return left;
    this.pos++;

    const right = this.parseExpression();
    if (!right) throw new SinthError(`Expected expression after '${op}'`, this.peek().loc);
    return { kind: "binary", left, op, right };
  }

  private parsePostfix(base: Expression): Expression {
    let expr = base;
    while (this.check(TT.LBRACKET)) {
      this.consume(TT.LBRACKET);
      const key = this.parseExpression();
      if (!key) throw new SinthError("Expected expression inside [...]", this.peek().loc);
      this.consume(TT.RBRACKET);
      expr = { kind: "index", object: expr, key };
    }
    return expr;
  }

    private parseCallExpr(expr: Expression): Expression {
    while (this.check(TT.LPAREN)) {
      this.consume(TT.LPAREN);
      const args: Expression[] = [];
      if (!this.check(TT.RPAREN)) {
        args.push(this.parseExpression()!);
        while (this.check(TT.COMMA)) {
          this.consume(TT.COMMA);
          args.push(this.parseExpression()!);
        }
      }
      if (!this.check(TT.RPAREN)) throw new SinthError("Expected ')' after arguments", this.peek().loc);
      this.consume(TT.RPAREN);
      expr = { kind: "call", callee: expr, args };
    }
    return expr;
  }


  // component definitions

  private parseFunctionDef(): FunctionDef {
    const loc    = this.consume(TT.KW_FUNCTION).loc;
    const name   = this.consume(TT.IDENT).value;
    const params = this.parseParamDecls();
    let returnType: VarType | undefined;
    if (this.check(TT.OP_ARROW)) {
      this.consume(TT.OP_ARROW);
      const typeTok = this.consume(TT.IDENT);
      if (!["int","str","bool","str[]","obj","ui"].includes(typeTok.value)) {
        throw new SinthError(`Unknown return type '${typeTok.value}'. Expected: int, str, bool, str[], obj, ui`, typeTok.loc);
      }
      returnType = typeTok.value as VarType;
    }
    if (!this.check(TT.LBRACE)) throw new SinthError("Expected '{' after function signature", this.peek().loc);
    this.consume(TT.LBRACE);
    const body = this.parseChildList();
    this.consume(TT.RBRACE);
    return { name, params, returnType, body, loc };
  }

  private parseCompDef(): CompDef {
    const loc    = this.consume(TT.KW_COMPONENT).loc;
    const name   = this.consume(TT.IDENT).value;
    const params = this.parseParamDecls();
    const rawTok = this.consume(TT.RAW_BLOCK);
    const { body, styles, scripts } = this.parseCompBody(rawTok.value, rawTok.loc);
    return { name, params, body, styles, scripts, loc };
  }

  private parseCustomEl(): CustomElDecl {
    const loc = this.peek().loc;
    if      (this.check(TT.KW_CUSTOM_EL)) this.consume(TT.KW_CUSTOM_EL);
    else if (this.check(TT.KW_CUSTOM))    this.consume(TT.KW_CUSTOM);
    const tagName   = this.consume(TT.IDENT).value;
    const sinthName = tagNameToPascal(tagName);
    const params    = this.parseParamDecls();
    return { sinthName, tagName, params, loc };
  }

    private parseReturnStmt(): ReturnStmt {
    const loc = this.consume(TT.KW_RETURN).loc;
    let expression: Expression | undefined;
    if (!this.check(TT.RBRACE) && !this.check(TT.EOF) && !this.check(TT.KW_IF) && !this.check(TT.KW_FOR) && !this.check(TT.KW_RETURN)) {
      expression = this.parseExpression() ?? undefined;
    }
    return { kind: "return", expression, loc };
  }

  private parseParamDecls(): ParamDecl[] {
    const params: ParamDecl[] = [];
    if (!this.check(TT.LPAREN)) return params;
    this.consume(TT.LPAREN);
    while (!this.check(TT.RPAREN)) {
      const ploc    = this.peek().loc;
      let pname: string;
      if (this.check(TT.IDENT) && ["int","str","bool","str[]","obj"].includes(this.peek().value) &&
          this.tokens[this.pos + 1]?.type === TT.IDENT) {
        this.consume(TT.IDENT); // consume type
        pname = this.consume(TT.IDENT).value;
      } else {
        const nameTok = this.check(TT.IDENT) ? this.consume(TT.IDENT) : this.consume(this.peek().type);
        pname = nameTok.value;
      }
      let defaultVal: Literal | undefined;
      if (this.check(TT.EQUALS)) { this.consume(TT.EQUALS); defaultVal = this.parseLiteral(); }
      params.push({ name: pname, defaultVal, loc: ploc });
      if (!this.check(TT.RPAREN)) this.consume(TT.COMMA);
    }
    this.consume(TT.RPAREN);
    return params;
  }

  private parseCompBody(
    raw: string,
    loc: Loc,
  ): { body: Child[]; styles: StyleBlock[]; scripts: ScriptBlock[] } {
    const tokens = new Lexer(raw, loc.file).tokenize();
    const sub    = new Parser(tokens, loc.file);
    sub._varDecls = this._varDecls;
    return sub.parseBodyContents();
  }

  private parseBodyContents(): { body: Child[]; styles: StyleBlock[]; scripts: ScriptBlock[] } {
    const body: Child[] = [], styles: StyleBlock[] = [], scripts: ScriptBlock[] = [];
    while (!this.check(TT.EOF)) {
      if      (this.check(TT.KW_STYLE))  { styles.push(this.parseStyleBlock()); }
      else if (this.check(TT.KW_SCRIPT)) { scripts.push(this.parseScriptBlock()); }
      else if (this.check(TT.STRING))    {
        const loc = this.peek().loc;
        body.push({ kind: "text", value: this.consume(TT.STRING).value, loc });
      }
      else if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) this._varDecls.push(vd);
        continue;
      }
      else if (this.check(TT.KW_RETURN)){ body.push(this.parseReturnStmt()); }
      else if (this.check(TT.KW_IF))    { body.push(this.parseIfBlock()); }
      else if (this.check(TT.KW_FOR))   { body.push(this.parseForLoop()); }
      else if (this.check(TT.IDENT))    { body.push(this.parseCompUse()); }
      else throw new SinthError(
        `Unexpected token '${this.peek().value}' in component body`,
        this.peek().loc,
      );
    }
    return { body, styles, scripts };
  }

  // if / else blocks

  private parseIfBlock(): IfBlock {
    const loc       = this.consume(TT.KW_IF).loc;
    const condition = this.parseExpression();
    if (!condition) throw new SinthError("Expected condition after 'if'", this.peek().loc);

    if (!this.check(TT.LBRACE)) throw new SinthError("Expected '{' after if condition", this.peek().loc);
    this.consume(TT.LBRACE);
    const body = this.parseUnifiedBody();
    this.consume(TT.RBRACE);

    let elseBody: Child[] | undefined;
    if (this.check(TT.KW_ELSE)) {
      this.consume(TT.KW_ELSE);
      if (this.check(TT.KW_IF)) {
        elseBody = [this.parseIfBlock()];
      } else {
        if (!this.check(TT.LBRACE)) throw new SinthError("Expected '{' after else", this.peek().loc);
        this.consume(TT.LBRACE);
        elseBody = this.parseUnifiedBody();
        this.consume(TT.RBRACE);
      }
    }

    return { kind: "if", condition, body, elseBody, loc };
  }

  private parseUnifiedBody(): Child[] {
    const children: Child[] = [];

    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if (this.check(TT.KW_RETURN)) { children.push(this.parseReturnStmt()); continue; }
      if (this.check(TT.KW_IF))  { children.push(this.parseIfBlock());  continue; }
      if (this.check(TT.KW_FOR)) { children.push(this.parseForLoop());  continue; }
      if (this.check(TT.LPAREN)) {
        const loc = this.peek().loc;
        const expr = this.parseExpression();
        if (expr) {
          children.push({ kind: "expr", expression: expr, loc });
        }
        continue;
      }
      if (this.check(TT.IDENT)) {
        const savedPos = this.pos;
        const name = this.peek().value;
        const nextType = this.tokens[this.pos + 1]?.type;
        if (nextType === TT.EQUALS || (nextType === TT.OP_PLUS && this.tokens[this.pos + 2]?.type === TT.EQUALS) || (nextType === TT.OP_MINUS && this.tokens[this.pos + 2]?.type === TT.EQUALS)) {
          this.consume(TT.IDENT);
          let op: AssignOp = "=";
          if (this.check(TT.OP_PLUS)) { this.consume(TT.OP_PLUS); op = "+="; }
          else if (this.check(TT.OP_MINUS)) { this.consume(TT.OP_MINUS); op = "-="; }
          this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after assignment", this.peek().loc);
          children.push({ kind: "assign_stmt", expression: { kind: "assign", target: name, op, right: rhs }, loc: this.peek().loc });
          continue;
        }
        this.pos = savedPos;
      }
      if (this.check(TT.STRING)) {
        const loc = this.peek().loc;
        children.push({ kind: "text", value: this.consume(TT.STRING).value, loc });
        continue;
      }

      if (this.check(TT.KW_REMOVE)) {
        const loc = this.consume(TT.KW_REMOVE).loc;
        if (this.check(TT.STRING)) {
          const target = this.consume(TT.STRING).value;
          children.push({ kind: "remove", target, loc });
        } else {
          throw new SinthError(
            `Expected a string after 'remove', got '${this.peek().value}'. Use remove "id".`,
            this.peek().loc,
          );
        }
        continue;
      }
      if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) this._varDecls.push(vd);
        continue;
      }

      if (this.check(TT.IDENT)) {
        const loc      = this.peek().loc;
        const name     = this.peek().value;
        const nextType = this.tokens[this.pos + 1]?.type;
        const nextNextType = this.tokens[this.pos + 2]?.type;

        if (nextType === TT.DOT && (nextNextType === TT.EQUALS || 
            (nextNextType === TT.OP_PLUS && this.tokens[this.pos + 3]?.type === TT.EQUALS) ||
            (nextNextType === TT.OP_MINUS && this.tokens[this.pos + 3]?.type === TT.EQUALS))) {
          let fullName = this.consume(TT.IDENT).value;
          this.consume(TT.DOT);
          fullName = fullName + "." + this.consume(TT.IDENT).value;
          
          let op: AssignOp = "=";
          const afterDotType = this.tokens[this.pos]?.type;
          if (afterDotType === TT.OP_PLUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
            this.consume(TT.OP_PLUS); op = "+=";
          } else if (afterDotType === TT.OP_MINUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
            this.consume(TT.OP_MINUS); op = "-=";
          }
          this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after assignment", this.peek().loc);
          const assignExpr: Expression = { kind: "assign", target: fullName, op, right: rhs };
          children.push({ kind: "assign_stmt", expression: assignExpr, loc });
          continue;
        }

        // assignment: ident = expr  |  ident += expr  |  ident -= expr
        const isSimpleAssign = nextType === TT.EQUALS;
        const isPlusAssign   = nextType === TT.OP_PLUS  && this.tokens[this.pos + 2]?.type === TT.EQUALS;
        const isMinusAssign  = nextType === TT.OP_MINUS && this.tokens[this.pos + 2]?.type === TT.EQUALS;

        if (isSimpleAssign || isPlusAssign || isMinusAssign) {
          this.consume(TT.IDENT); // consume name
          let op: AssignOp = "=";
          if      (isPlusAssign)  { this.consume(TT.OP_PLUS);  op = "+="; }
          else if (isMinusAssign) { this.consume(TT.OP_MINUS); op = "-="; }
          this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after assignment", this.peek().loc);
          const assignExpr: Expression = { kind: "assign", target: name, op, right: rhs };
          children.push({ kind: "assign_stmt", expression: assignExpr, loc });
          continue;
        }

        // Component usage: ident( or ident{ or ident RAW_BLOCK
        if (nextType === TT.LPAREN || nextType === TT.LBRACE || nextType === TT.RAW_BLOCK) {
          children.push(this.parseCompUse());
          continue;
        }

        // var expression
        // check dot notation variable reference (user.age without assignment)
        if (nextType === TT.DOT) {
          let fullName = this.consume(TT.IDENT).value;
          this.consume(TT.DOT);
          fullName = fullName + "." + this.consume(TT.IDENT).value;
          children.push({ kind: "expr", expression: { kind: "variable", name: fullName }, loc });
          continue;
        }

        // bracket notation: ident[...]
        if (nextType === TT.LBRACKET) {
          this.consume(TT.IDENT);
          const varExpr: Expression = { kind: "variable", name };
          const indexedExpr = this.parsePostfix(varExpr);
          children.push({ kind: "expr", expression: indexedExpr, loc });
          continue;
        }


        // simple variable reference
        this.consume(TT.IDENT);
        children.push({ kind: "expr", expression: { kind: "variable", name }, loc });
        continue;
      }

      throw new SinthError(
        `Unexpected token '${this.peek().value}' in if/else body`,
        this.peek().loc,
      );

      // reject implicit concatenation only after expression children
      if (children.length > 0) {
        const lastChild = children[children.length - 1];
        if (lastChild.kind === "text" || lastChild.kind === "expr" || lastChild.kind === "assign_stmt") {
          const nextTT = this.tokens[this.pos]?.type;
          if (
            nextTT === TT.STRING || nextTT === TT.NUMBER ||
            nextTT === TT.BOOL_TRUE || nextTT === TT.BOOL_FALSE || nextTT === TT.NULL_LIT ||
            (nextTT === TT.IDENT &&
              this.tokens[this.pos]?.value !== "var" &&
              this.tokens[this.pos]?.value !== "if" &&
              this.tokens[this.pos]?.value !== "for" &&
              this.tokens[this.pos]?.value !== "else" &&
              this.tokens[this.pos]?.value !== "and" &&
              this.tokens[this.pos]?.value !== "or")
          ) {
            throw new SinthError(
              `Unexpected ${TT[nextTT]}. Use '+' to concatenate values.`,
              this.peek().loc,
            );
          }
        }
      }
    }

    return children;
  }


  private parseForLoop(): ForLoop {
    const loc     = this.consume(TT.KW_FOR).loc;
    const firstVar = this.consume(TT.IDENT).value;
    let keyVar: string | undefined;
    let itemVar: string;
    let indexVar: string | undefined;
    if (this.check(TT.COMMA)) {
      this.consume(TT.COMMA);
      const secondVar = this.consume(TT.IDENT).value;
      if (this.check(TT.COMMA)) {
        this.consume(TT.COMMA);
        keyVar = firstVar;
        itemVar = secondVar;
        indexVar = this.consume(TT.IDENT).value;
      } else {
        itemVar = firstVar;
        indexVar = secondVar;
      }
    } else {
      itemVar = firstVar;
    }
    if (!this.check(TT.KW_IN)) throw new SinthError("Expected 'in' after loop variable", this.peek().loc);
    this.consume(TT.KW_IN);
    const arrayVar = this.consume(TT.IDENT).value;

    if (keyVar === undefined && indexVar !== undefined) {
      const srcDecl = this._varDecls.find(d => d.name === arrayVar);
      if (srcDecl && srcDecl.varType === "obj") {
        const val = srcDecl.value;
        const isArray = val && val.kind === "str" && val.value.startsWith("__ARR__");
        if (!isArray) {
          keyVar = itemVar;
          itemVar = indexVar;
          indexVar = undefined;
        }
      }
    }

    if (!this.check(TT.LBRACE)) throw new SinthError("Expected '{' after for..in expression", this.peek().loc);
    this.consume(TT.LBRACE);
    this.loopVar = itemVar;
    const body = this.parseChildList();
    this.loopVar = null;
    this.consume(TT.RBRACE);

    return { kind: "for", keyVar, itemVar, indexVar, arrayVar, body, loc };
  }



  private parseCompUse(): CompUse {
    const loc  = this.peek().loc;
    const name = this.consume(TT.IDENT).value;
    const attrs: Attr[] = [];

    if (this.check(TT.LPAREN)) {
      this.consume(TT.LPAREN);
      while (!this.check(TT.RPAREN)) {
        const aloc  = this.peek().loc;
        const aname = this.consume(TT.IDENT).value;
        let value: Literal | null = null;
        if (this.check(TT.COLON)) {
          this.consume(TT.COLON);
          if (this.isEventAttr(aname)) {
            if (this.check(TT.STRING)) {
              value = this.parseLiteral();
            } else {
              const savedPos = this.pos;
              const expr = this.parseExpression();
              if (expr && (this.check(TT.COMMA) || this.check(TT.RPAREN) || this.check(TT.OP_SEMI))) {
                const exprs: Expression[] = [expr];
                while (this.check(TT.OP_SEMI)) {
                  this.consume(TT.OP_SEMI);
                  const next = this.parseExpression();
                  if (next) exprs.push(next);
                  else break;
                }
                if (exprs.length === 1) {
                  value = { kind: "str", value: "__EXPR__" + JSON.stringify(exprs[0]) };
                } else {
                  value = { kind: "str", value: "__MULTI_EXPR__" + JSON.stringify(exprs) };
                }
              } else {
                this.pos = savedPos;
                value = this.parseLiteral();
              }
            }
          } else {
            if (this.check(TT.STRING) || this.check(TT.NUMBER) ||
                this.check(TT.BOOL_TRUE) || this.check(TT.BOOL_FALSE) ||
                this.check(TT.NULL_LIT) || this.check(TT.LBRACKET) || this.check(TT.LBRACE)) {
              value = this.parseLiteral();
            } else if (this.check(TT.IDENT) || this.check(TT.LPAREN)) {
              const savedPos = this.pos;
              const expr = this.parseExpression();
              if (expr && (this.check(TT.COMMA) || this.check(TT.RPAREN))) {
                value = { kind: "str", value: "__EXPR__" + JSON.stringify(expr) };
              } else {
                this.pos = savedPos;
                if (this.check(TT.IDENT)) {
                  value = { kind: "str", value: this.consume(TT.IDENT).value };
                } else {
                  value = this.parseLiteral();
                }
              }
            } else {
              value = this.parseLiteral();
            }
          }
        }
        attrs.push({ name: aname, value, loc: aloc });
        if (!this.check(TT.RPAREN)) this.consume(TT.COMMA);
      }
      this.consume(TT.RPAREN);
    }

    const children: Child[] = [];
    if (this.check(TT.RAW_BLOCK)) {
      const rawTok = this.consume(TT.RAW_BLOCK);
      const tokens = new Lexer(rawTok.value, rawTok.loc.file).tokenize();
      const sub    = new Parser(tokens, rawTok.loc.file);
      sub._varDecls = this._varDecls;
      children.push(...sub.parseChildList());
    } else if (this.check(TT.LBRACE)) {
      this.consume(TT.LBRACE);
      children.push(...this.parseChildList());
      this.consume(TT.RBRACE);
    }

    return { kind: "use", name, attrs, children, loc };
  }

  private isEventAttr(name: string): boolean {
    return name.startsWith("on") && name.length > 2 && name[2] === name[2].toUpperCase();
  }

  private parseChildList(): Child[] {
    const children: Child[] = [];
    while (!this.check(TT.EOF) && !this.check(TT.RBRACE)) {
      if (this.check(TT.LPAREN)) {
        const loc = this.peek().loc;
        this.consume(TT.LPAREN);
        let expr = this.parseExpression();
        if (!expr) throw new SinthError("Expected expression after '('", this.peek().loc);
        if (!this.check(TT.RPAREN)) throw new SinthError("Expected ')'", this.peek().loc);
        this.consume(TT.RPAREN);
        while (this.check(TT.OP_PLUS)) {
          this.consume(TT.OP_PLUS);
          let rhs: Expression | null = null;
          if (this.check(TT.STRING)) {
            rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
          } else if (this.check(TT.IDENT)) {
            const rhsName = this.consume(TT.IDENT).value;
            if (this.check(TT.DOT)) {
              this.consume(TT.DOT);
              rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
            } else if (this.check(TT.LBRACKET)) {
              const rhsVar: Expression = { kind: "variable", name: rhsName };
              rhs = this.parsePostfix(rhsVar);
            } else {
              rhs = { kind: "variable", name: rhsName };
            }
          } else {
            rhs = this.parseExpression();
          }
          if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
          expr = { kind: "binary", left: expr, op: "+", right: rhs };
        }
        children.push({ kind: "expr", expression: expr, loc });
        continue;
      }
      if (this.check(TT.STRING)) {
        const loc      = this.peek().loc;
        let leftExpr: Expression = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
        while (this.check(TT.OP_PLUS)) {
          this.consume(TT.OP_PLUS);
          let rhs: Expression | null = null;
          if      (this.check(TT.STRING)) {
            rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
          } else if (this.check(TT.IDENT)) {
            const rhsName = this.consume(TT.IDENT).value;
            if (this.check(TT.DOT)) {
              this.consume(TT.DOT);
              rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
            } else if (this.check(TT.LBRACKET)) {
              const rhsVar: Expression = { kind: "variable", name: rhsName };
              rhs = this.parsePostfix(rhsVar);
            } else {
              rhs = { kind: "variable", name: rhsName };
            }
          } else {
            rhs = this.parseExpression();
          }
          if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
          leftExpr = { kind: "binary", left: leftExpr, op: "+", right: rhs };
        }
        children.push({ kind: "expr", expression: leftExpr, loc });
      }
      else if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) this._varDecls.push(vd);
        continue;
      }
      else if (this.check(TT.KW_RETURN)) { children.push(this.parseReturnStmt()); continue; }
      else if (this.check(TT.KW_IF))  { children.push(this.parseIfBlock());  }
      else if (this.check(TT.KW_FOR)) { children.push(this.parseForLoop());  }
      else if (this.check(TT.IDENT))  {
        const loc  = this.peek().loc;
        const rawName = this.peek().value;
        const nextType = this.tokens[this.pos + 1]?.type;
        
        if (nextType === TT.EQUALS || (nextType === TT.OP_PLUS && this.tokens[this.pos + 2]?.type === TT.EQUALS) || (nextType === TT.OP_MINUS && this.tokens[this.pos + 2]?.type === TT.EQUALS)) {
          this.consume(TT.IDENT);
          let op: AssignOp = "=";
          if (this.check(TT.OP_PLUS)) { this.consume(TT.OP_PLUS); op = "+="; }
          else if (this.check(TT.OP_MINUS)) { this.consume(TT.OP_MINUS); op = "-="; }
          this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after assignment", this.peek().loc);
          children.push({ kind: "assign_stmt", expression: { kind: "assign", target: rawName, op, right: rhs }, loc });
          continue;
        }
        
        if (nextType === TT.DOT) {
          let fullName = this.consume(TT.IDENT).value;
          this.consume(TT.DOT);
          fullName = fullName + "." + this.consume(TT.IDENT).value;
          const afterDotType = this.tokens[this.pos]?.type;
          
          if (afterDotType === TT.OP_PLUS) {
            let leftExpr: Expression = { kind: "variable", name: fullName };
            while (this.check(TT.OP_PLUS)) {
              this.consume(TT.OP_PLUS);
              let rhs: Expression | null = null;
              if (this.check(TT.STRING)) {
                rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
              } else if (this.check(TT.IDENT)) {
                const rhsName = this.consume(TT.IDENT).value;
                if (this.check(TT.DOT)) {
                  this.consume(TT.DOT);
                  rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
                } else if (this.check(TT.LBRACKET)) {
                  const rhsVar: Expression = { kind: "variable", name: rhsName };
                  rhs = this.parsePostfix(rhsVar);
                } else {
                  rhs = { kind: "variable", name: rhsName };
                }
              } else {
                rhs = this.parseExpression();
              }
              if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
              leftExpr = { kind: "binary", left: leftExpr, op: "+", right: rhs };
            }
            children.push({ kind: "expr", expression: leftExpr, loc });
          } else if (this.loopVar && fullName.split('.')[0] === this.loopVar) {
            children.push({ kind: "expr", expression: { kind: "variable", name: fullName }, loc });
          } else if (afterDotType === TT.LPAREN || afterDotType === TT.LBRACE || afterDotType === TT.RAW_BLOCK) {
            throw new SinthError(`Unexpected dot notation before component usage`, loc);
          } else {
            children.push({ kind: "expr", expression: { kind: "variable", name: fullName }, loc });
          }
        } else if (nextType === TT.OP_PLUS) {
          const name = this.consume(TT.IDENT).value;
          let leftExpr: Expression = { kind: "variable", name };
          while (this.check(TT.OP_PLUS)) {
            this.consume(TT.OP_PLUS);
            let rhs: Expression | null = null;
            if (this.check(TT.STRING)) {
              rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
            } else if (this.check(TT.IDENT)) {
              const rhsName = this.consume(TT.IDENT).value;
              if (this.check(TT.DOT)) {
                this.consume(TT.DOT);
                rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
              } else if (this.check(TT.LBRACKET)) {
                const rhsVar: Expression = { kind: "variable", name: rhsName };
                rhs = this.parsePostfix(rhsVar);
              } else {
                rhs = { kind: "variable", name: rhsName };
              }
            } else {
              rhs = this.parseExpression();
            }
            if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
            leftExpr = { kind: "binary", left: leftExpr, op: "+", right: rhs };
          }
          children.push({ kind: "expr", expression: leftExpr, loc });
        } else if (this.loopVar && rawName === this.loopVar) {
          this.consume(TT.IDENT);
          children.push({ kind: "expr", expression: { kind: "variable", name: rawName }, loc });
        } else if (nextType === TT.LBRACKET) {
          const name = this.consume(TT.IDENT).value;
          const varExpr: Expression = { kind: "variable", name };
          let indexedExpr = this.parsePostfix(varExpr);
          if (this.check(TT.OP_PLUS)) {
            let leftExpr: Expression = indexedExpr;
            while (this.check(TT.OP_PLUS)) {
              this.consume(TT.OP_PLUS);
              let rhs: Expression | null = null;
              if (this.check(TT.STRING)) {
                rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
              } else if (this.check(TT.IDENT)) {
                const rhsName = this.consume(TT.IDENT).value;
                if (this.check(TT.DOT)) {
                  this.consume(TT.DOT);
                  rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
                } else if (this.check(TT.LBRACKET)) {
                  const rhsVar: Expression = { kind: "variable", name: rhsName };
                  rhs = this.parsePostfix(rhsVar);
                } else {
                  rhs = { kind: "variable", name: rhsName };
                }
              } else {
                rhs = this.parseExpression();
              }
              if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
              leftExpr = { kind: "binary", left: leftExpr, op: "+", right: rhs };
            }
            children.push({ kind: "expr", expression: leftExpr, loc });
          } else {
            children.push({ kind: "expr", expression: indexedExpr, loc });
          }
        } else if (nextType === TT.LPAREN || nextType === TT.LBRACE || nextType === TT.RAW_BLOCK) {
          children.push(this.parseCompUse());
        } else {
          const name = this.consume(TT.IDENT).value;
          children.push({ kind: "expr", expression: { kind: "variable", name }, loc });
        }
      }
      else throw new SinthError(`Unexpected token '${this.peek().value}' in children`, this.peek().loc);
      // reject implicit concatenation only after expression children
      if (children.length > 0) {
        const lastChild = children[children.length - 1];
        if (lastChild.kind === "text" || lastChild.kind === "expr" || lastChild.kind === "assign_stmt") {
          const nextTT = this.tokens[this.pos]?.type;
          if (
            nextTT === TT.STRING || nextTT === TT.NUMBER ||
            nextTT === TT.BOOL_TRUE || nextTT === TT.BOOL_FALSE || nextTT === TT.NULL_LIT ||
            (nextTT === TT.IDENT &&
              this.tokens[this.pos]?.value !== "var" &&
              this.tokens[this.pos]?.value !== "if" &&
              this.tokens[this.pos]?.value !== "for" &&
              this.tokens[this.pos]?.value !== "else" &&
              this.tokens[this.pos]?.value !== "and" &&
              this.tokens[this.pos]?.value !== "or")
          ) {
            throw new SinthError(
              `Unexpected ${TT[nextTT]}. Use '+' to concatenate values.`,
              this.peek().loc,
            );
          }
        }
      }
    }
    return children;
  }

  // style & script blocks

  private parseStyleBlock(): StyleBlock {
    const loc = this.consume(TT.KW_STYLE).loc;
    let global = false, lang: "css" | "scss" = "css", target: string | undefined;
    const extraAttrs: Record<string, string> = {};

    while (!this.check(TT.RAW_BLOCK) && !this.check(TT.EOF)) {
      if (this.check(TT.KW_GLOBAL)) { global = true; this.consume(TT.KW_GLOBAL); }
      else if (this.check(TT.KW_LANG)) {
        this.consume(TT.KW_LANG); this.consume(TT.EQUALS);
        const lv = this.consume(TT.STRING).value;
        if (lv !== "css" && lv !== "scss") throw new SinthError(`Unsupported style lang '${lv}'`, loc);
        lang = lv as "css" | "scss";
      }
      else if (this.check(TT.IDENT)) {
        if (this.tokens[this.pos + 1]?.type !== TT.EQUALS) {
          target = this.consume(TT.IDENT).value;
        } else {
          const k = this.consume(TT.IDENT).value;
          this.consume(TT.EQUALS);
          extraAttrs[k] = this.consume(TT.STRING).value;
        }
      }
      else throw new SinthError(`Unexpected token '${this.peek().value}' in style modifiers`, this.peek().loc);
    }

    return { global, lang, raw: this.consume(TT.RAW_BLOCK).value, target, extraAttrs, loc };
  }

  private parseScriptBlock(): ScriptBlock {
    const loc = this.consume(TT.KW_SCRIPT).loc;
    const attrs: Record<string, string> = {};
    while (!this.check(TT.RAW_BLOCK) && !this.check(TT.EOF)) {
      const key = this.consume(TT.IDENT).value;
      if (this.check(TT.EQUALS)) { this.consume(TT.EQUALS); attrs[key] = this.consume(TT.STRING).value; }
      else { attrs[key] = "true"; }
    }
    return { raw: this.consume(TT.RAW_BLOCK).value, attrs, loc };
  }

 private parseLiteral(): Literal {
    const tok = this.peek();
    if (this.check(TT.LBRACKET))  { return this.parseArrayLiteral(); }
    if (this.check(TT.LBRACE))    { 
      const obj = this.parseObjectLiteral();
      return { kind: "str", value: JSON.stringify(obj) };
    }
    if (this.check(TT.STRING))    { this.consume(TT.STRING);    return { kind: "str",  value: tok.value }; }
    if (this.check(TT.NUMBER))    { this.consume(TT.NUMBER);    return { kind: "num",  value: parseFloat(tok.value) }; }
    if (this.check(TT.BOOL_TRUE)) { this.consume(TT.BOOL_TRUE); return { kind: "bool", value: true }; }
    if (this.check(TT.BOOL_FALSE)){ this.consume(TT.BOOL_FALSE);return { kind: "bool", value: false }; }
    if (this.check(TT.NULL_LIT))  { this.consume(TT.NULL_LIT);  return { kind: "null" }; }
    throw new SinthError(`Expected literal value, got '${tok.value}' (${TT[tok.type]})`, tok.loc);
  }

  private peek(): Token         { return this.tokens[this.pos]; }
  private check(t: TT): boolean { return this.tokens[this.pos]?.type === t; }
  private consume(t: TT): Token {
    const tok = this.tokens[this.pos];
    if (tok.type !== t) {
      throw new SinthError(
        `Expected ${TT[t]}, got '${tok.value}' (${TT[tok.type]})`,
        tok.loc,
      );
    }
    this.pos++;
    return tok;
  }
}