import { Component, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface Node {
  id: string;
  children: Node[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {

  // セレクトボックスの現在の選択値
  leftSelectBoxModel: string;
  rightSelectBoxModel: string;

  // セレクトボックスの選択肢
  leftList: string[] = [];
  rightList: string[] = [];

  // 木構造
  leftTree: Node = {
    id: '(root)',
    children: [
      { id: 'node1', children: [
        { id: 'node1-1', children: []},
        { id: 'node1-2', children: []},
        { id: 'node1-3', children: [
          {id: 'node1-3-1', children: []},
          {id: 'node1-3-2', children: []},
          {id: 'node1-3-3', children: []},
        ]},
      ]},
      { id: 'node2', children: [
        { id: 'node2-1', children: [
          {id: 'node2-1-1', children: []},
          {id: 'node2-1-2', children: []},
        ]},
        { id: 'node2-2', children: []},
      ]},
    ]
  };

  rightTree: Node = { id: '(root)', children: [] };

  // 木構造表示用のHTML
  leftTreeHtml: SafeHtml = '';
  rightTreeHtml: SafeHtml = '';
  selectedSubTreeHtml: SafeHtml = '';

  upButtonEnabled = false;
  downButtonEnabled = false;

  constructor(private sanitizer: DomSanitizer) {
    this.leftList = this.convertToArrayExceptForRoot(this.leftTree);
    this.rightList = this.convertToArrayExceptForRoot(this.rightTree);

    this.leftTreeHtml = this.createHtmlForTree(this.leftTree);
    this.rightTreeHtml = this.createHtmlForTree(this.rightTree);
  }

  // 木構造操作のユーティリティメソッド群

  /** 与えられた木構造のうち、ルート以外のノードのidを
   * 深さ優先順の配列形式に変換して返却します */
  convertToArrayExceptForRoot(root: Node): string[] {
    return this.convertToArray(root).slice(1);
  }

  /** 与えられた木構造のすべてのノードのidを
   * 深さ優先順の配列形式に変換して返却します */
  convertToArray(root: Node): string[] {
    return (root.children || [])
      .reduce((arr, c) => arr.concat(this.convertToArray(c)), [root.id]);
  }

  /** 指定したidに一致するノード、およびルートからの経路を返却します */
  private find(root: Node, id: string, path: string[] = []): { node: Node, path: string[] } {
    const nextPath: string[] = path.concat([root.id]);

    return root.id === id ? ({ node: root, path: nextPath }) :
      (root.children || [])
        .map(child => this.find(child, id, nextPath))
        .find(x => !!x.node) || ({node: null, path: []});
  }

  /** 指定したidに一致するノードまでの、ルートからの経路を返却します */
  private findPath(root: Node, id: string): string[] {
    return this.find(root, id).path;
  }

  /** 指定したidに一致するノードを返却します */
  private findNode(root: Node, id: string): Node {
    return this.find(root, id).node;
  }

  /** 指定したidに一致するノードの親ノード、およびルートからの経路を返却します */
  private findParent(root: Node, id: string): { node: Node, path: string[] } {
    const path = this.findPath(root, id);
    return path.length < 2 ? ({node: null, path: []}) :
      this.find(root, path.reverse()[1]);
  }

  /** 指定したidに一致するノードを持つ部分木を抽出します
   * 子ノードはそのまま部分木になります */
  private extractSubTree(root: Node, id: string): Node {
    const { node, path } = this.find(root, id);
    return path.reverse()
      .filter(x => x !== id)
      .reduce((n, x) => ({ id: x, children: [n] }), node);
  }

  /** 指定したノードをディープコピーします */
  private copy(root: Node): Node {
    return ({ id: root.id, children: (root.children || []).map(x => this.copy(x)) });
  }

  /** 指定したidに一致するノードを持つ部分木を、
   * 元の木構造から取り除いた結果を返却します */
  private removeSubTree(root: Node, id: string, destructive: boolean = false): Node {
    const subTree = destructive ? root : this.copy(root);
    const { node } = this.findParent(subTree, id);
    if (!node) return subTree;

    node.children = (node.children || []).filter(x => x.id !== id);
    return !!node.children.length ? subTree :
      this.removeSubTree(subTree, node.id, true);
  }

  /** 自ノードの子に、指定したidを持つノードがあれば返却します */
  private findChild(target: Node, id: string): Node {
    if (!target) return null;
    const child = (target.children || []).filter(x => x.id === id);
    return child.length ? child[0] : null;
  }

  /** 2つの木構造をマージした結果を返却します */
  private merge(target: Node, source: Node): Node {
    if (target.id !== source.id) return null;
    if (!(target.children || []).length) return source;
    if (!(source.children || []).length) return target;

    const newChildren: Node[] = (target.children || [])
      .map(c => {
        const otherChild = this.findChild(source, c.id);
        return otherChild ? this.merge(c, otherChild) : c;
      });

    newChildren
      .push(...(source.children || [])
        .filter(c => !this.findChild(target, c.id)));

    const ret = this.copy(target);
    ret.children = newChildren;
    return ret;
  }

  canMoveToUp(root: Node, id: string): boolean {
    const { node } = this.findParent(root, id);
    if (!node) return false;

    const index = node.children.map(x => x.id).indexOf(id);
    if (index === 0) return this.canMoveToUp(root, node.id);
    return true;
  }

  canMoveToDown(root: Node, id: string): boolean {
    const { node } = this.findParent(root, id);
    if (!node) return false;

    const index = node.children.map(x => x.id).indexOf(id);
    if (index === node.children.length - 1) return this.canMoveToDown(root, node.id);
    return true;
  }

  up(root: Node, id: string, destructive: boolean = false): Node {
    if (root.id === id) return root;

    const _root = destructive ? root : this.copy(root);
    const { node } = this.findParent(_root, id);
    if (!node) return null;

    const children = node.children;
    const childrenIdList = children.map(x => x.id);
    const index = childrenIdList.indexOf(id);
    if (index === 0) return this.up(_root, node.id, true);

    children.splice(index - 1, 2, children[index], children[index - 1]);
    return _root;
  }

  down(root: Node, id: string, destructive: boolean = false): Node {
    if (root.id === id) return root;

    const _root = destructive ? root : this.copy(root);
    const { node } = this.findParent(_root, id);
    if (!node) return null;

    const children = node.children;
    const childrenIdList = children.map(x => x.id);
    const index = childrenIdList.indexOf(id);
    if (index === children.length - 1) return this.down(_root, node.id, true);

    children.splice(index, 2, children[index + 1], children[index]);
    return _root;
  }

  /** ここから先はHTMLを動的に生成するためのものなのでコメントは省略 */
  private createHtmlForTree(root: Node): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.createHtmlUlForTree(root));
  }

  private createHtmlUlForTree(root: Node, isRoot: boolean = true): string {
    if (!root) return '';

    return isRoot ?
      `<ul><li>${this.sanitizer.sanitize(SecurityContext.HTML, root.id)}${this.createHtmlUlForTree(root, false)}</li></ul>` :
      `<ul>${this.createHtmlLiForTree(root)}</ul>`;
  }

  private createHtmlLiForTree(root: Node): string {
    if (!root) return '';
    return (root.children || [])
      .map(x => `<li>${this.sanitizer.sanitize(SecurityContext.HTML, x.id)}${this.createHtmlUlForTree(x, false)}</li>`)
      .join('');
  }

  // ここからUI用
  moveToRight() {
    const id = this.leftSelectBoxModel;
    if (!id) return;

    const ext = this.extractSubTree(this.leftTree, id);
    if (!ext) return;

    const index = this.leftList.indexOf(id);

    this.leftTree = this.removeSubTree(this.leftTree, id);
    this.leftList = this.convertToArrayExceptForRoot(this.leftTree);
    this.leftTreeHtml = this.createHtmlForTree(this.leftTree);

    this.rightTree = this.merge(this.rightTree, ext);
    this.rightList = this.convertToArrayExceptForRoot(this.rightTree);
    this.rightTreeHtml = this.createHtmlForTree(this.rightTree);

    const newSelectedItem = this.leftList[Math.min(this.leftList.length - 1, index)];
    this.leftSelectBoxModel = newSelectedItem;
    this.leftSelectedChanged();
  }

  moveToLeft() {
    const id = this.rightSelectBoxModel;
    if (!id) return;

    const ext = this.extractSubTree(this.rightTree, id);
    if (!ext) return;

    const index = this.rightList.indexOf(id);

    this.rightTree = this.removeSubTree(this.rightTree, id);
    this.rightList = this.convertToArrayExceptForRoot(this.rightTree);
    this.rightTreeHtml = this.createHtmlForTree(this.rightTree);

    this.leftTree = this.merge(this.leftTree, ext);
    this.leftList = this.convertToArrayExceptForRoot(this.leftTree);
    this.leftTreeHtml = this.createHtmlForTree(this.leftTree);

    const newSelectedItem = this.rightList[Math.min(this.rightList.length - 1, index)];
    this.rightSelectBoxModel = newSelectedItem;
    this.rightSelectedChanged();
  }

  moveToUp() {
    let id = this.rightSelectBoxModel;
    if (id) {
      this.rightTree = this.up(this.rightTree, id);
      this.rightList = this.convertToArrayExceptForRoot(this.rightTree);
      this.rightTreeHtml = this.createHtmlForTree(this.rightTree);
      this.upButtonEnabled = this.canMoveToUp(this.rightTree, id);
      this.downButtonEnabled = this.canMoveToDown(this.rightTree, id);
    }

    id = this.leftSelectBoxModel;
    if (id) {
      this.leftTree = this.up(this.leftTree, id);
      this.leftList = this.convertToArrayExceptForRoot(this.leftTree);
      this.leftTreeHtml = this.createHtmlForTree(this.leftTree);
      this.upButtonEnabled = this.canMoveToUp(this.leftTree, id);
      this.downButtonEnabled = this.canMoveToDown(this.leftTree, id);
    }
  }

  moveToDown() {
    let id = this.rightSelectBoxModel;
    if (id) {
      this.rightTree = this.down(this.rightTree, id);
      this.rightList = this.convertToArrayExceptForRoot(this.rightTree);
      this.rightTreeHtml = this.createHtmlForTree(this.rightTree);
      this.upButtonEnabled = this.canMoveToUp(this.rightTree, id);
      this.downButtonEnabled = this.canMoveToDown(this.rightTree, id);
    }

    id = this.leftSelectBoxModel;
    if (id) {
      this.leftTree = this.down(this.leftTree, id);
      this.leftList = this.convertToArrayExceptForRoot(this.leftTree);
      this.leftTreeHtml = this.createHtmlForTree(this.leftTree);
      this.upButtonEnabled = this.canMoveToUp(this.leftTree, id);
      this.downButtonEnabled = this.canMoveToDown(this.leftTree, id);
    }
  }


  // 左側のセレクトボックスの選択状態が変更された場合
  leftSelectedChanged() {
    if (!this.leftSelectBoxModel) {
      this.selectedSubTreeHtml = '';
      this.upButtonEnabled = false;
      this.downButtonEnabled = false;
      return;
    }

    this.upButtonEnabled = this.canMoveToUp(this.leftTree, this.leftSelectBoxModel);
    this.downButtonEnabled = this.canMoveToDown(this.leftTree, this.leftSelectBoxModel);
    this.rightSelectBoxModel = '';
    this.selectedSubTreeHtml =
      this.createHtmlForTree(this.extractSubTree(this.leftTree, this.leftSelectBoxModel));
  }

  // 右側のセレクトボックスの選択状態が変更された場合
  rightSelectedChanged() {
    if (!this.rightSelectBoxModel) {
      this.selectedSubTreeHtml = '';
      this.upButtonEnabled = false;
      this.downButtonEnabled = false;
      return;
    }
    this.upButtonEnabled = this.canMoveToUp(this.rightTree, this.rightSelectBoxModel);
    this.downButtonEnabled = this.canMoveToDown(this.rightTree, this.leftSelectBoxModel);
    this.leftSelectBoxModel = '';
    this.selectedSubTreeHtml =
      this.createHtmlForTree(this.extractSubTree(this.rightTree, this.rightSelectBoxModel));
  }

}
