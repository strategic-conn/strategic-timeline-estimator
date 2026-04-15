"use client";

import * as React from "react";
import DOMPurify from "dompurify";
import {
  MessageSquare,
  Pencil,
  Reply as ReplyIcon,
  Smile,
  Trash2,
  Send,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { cn } from "@/lib/utils";
import type { Comment, Reply } from "@/types/task.types";
import {
  CURRENT_USER_ID,
  EMOJI_OPTIONS,
} from "@/types/task.types";

const MAX_COMMENT_LENGTH = 1000;

const MENTION_SPAN_CLASS =
  "text-blue-600 dark:text-blue-400 font-medium";

const NAMES_BY_LENGTH = [...TEAM_MEMBERS].sort(
  (a, b) => b.name.length - a.name.length
);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Converts `@Full Name` segments (known team members) to highlighted spans; escapes the rest. */
function commentBodyToHighlightHtml(body: string): string {
  let html = escapeHtml(body);
  for (const m of NAMES_BY_LENGTH) {
    const nameEscaped = escapeHtml(m.name);
    const re = new RegExp(`@${escapeRegExp(nameEscaped)}`, "g");
    html = html.replace(
      re,
      `<span class="${MENTION_SPAN_CLASS}">@${nameEscaped}</span>`
    );
  }
  return html;
}

function sanitizeCommentHtml(html: string): string {
  if (typeof window === "undefined") {
    return html;
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["span"],
    ALLOWED_ATTR: ["class"],
  });
}

function timeAgo(dateString: string): string {
  const then = new Date(dateString).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.floor(Math.abs(diffMs) / 1000);
  if (diffMs < 0) return "just now";
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  if (sec < 2592000) return `${Math.floor(sec / 604800)}w ago`;
  return `${Math.floor(sec / 2592000)}mo ago`;
}

function getMember(id: number) {
  return TEAM_MEMBERS.find((m) => m.id === id);
}

function filterMembersByQuery(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return TEAM_MEMBERS;
  return TEAM_MEMBERS.filter((m) => m.name.toLowerCase().includes(q));
}

function extractMentionIds(body: string): number[] {
  const ids: number[] = [];
  for (const m of TEAM_MEMBERS) {
    if (body.includes(`@${m.name}`)) {
      ids.push(m.id);
    }
  }
  return ids;
}

function useMentionableTextarea({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = React.useState<{
    start: number;
    query: string;
  } | null>(null);

  const updateMentionFromCursor = React.useCallback(
    (el: HTMLTextAreaElement, cursor: number) => {
      const before = el.value.slice(0, cursor);
      const at = before.lastIndexOf("@");
      if (at < 0) {
        setMention(null);
        return;
      }
      const afterAt = before.slice(at + 1);
      if (afterAt.includes("\n")) {
        setMention(null);
        return;
      }
      setMention({ start: at, query: afterAt });
    },
    []
  );

  const onInternalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    let next = el.value;
    if (next.length > maxLength) next = next.slice(0, maxLength);
    onChange(next);
    updateMentionFromCursor(el, el.selectionStart);
  };

  const onSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    updateMentionFromCursor(el, el.selectionStart);
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    updateMentionFromCursor(el, el.selectionStart);
  };

  const insertMention = (member: (typeof TEAM_MEMBERS)[number]) => {
    const el = ref.current;
    if (!el || !mention) return;
    const pos = el.selectionStart;
    const v = el.value;
    const before = v.slice(0, mention.start);
    const after = v.slice(pos);
    const insert = `@${member.name} `;
    const next = `${before}${insert}${after}`;
    const capped = next.length > maxLength ? next.slice(0, maxLength) : next;
    onChange(capped);
    setMention(null);
    const caret = Math.min(before.length + insert.length, capped.length);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const mentionOpen = mention !== null;
  const filteredMembers = mention ? filterMembersByQuery(mention.query) : [];

  return {
    ref,
    mentionOpen,
    filteredMembers,
    insertMention,
    onInternalChange,
    onSelect,
    onKeyUp,
    closeMention: () => setMention(null),
  };
}

function CommentBodyHtml({ body }: { body: string }) {
  const html = React.useMemo(() => {
    const raw = commentBodyToHighlightHtml(body);
    return sanitizeCommentHtml(raw);
  }, [body]);

  return (
    <div
      className="text-sm whitespace-pre-wrap wrap-break-word text-foreground [&_span]:text-blue-600 [&_span]:dark:text-blue-400 [&_span]:font-medium"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export interface TaskCommentSectionProps {
  taskId: string;
  comments: Comment[];
  onAddComment: (taskId: string, body: string) => void;
  onEditComment: (taskId: string, commentId: string, body: string) => void;
  onDeleteComment: (taskId: string, commentId: string) => void;
  onAddReply: (
    taskId: string,
    commentId: string,
    body: string,
    mentionIds: number[]
  ) => void;
  onAddReaction: (
    taskId: string,
    commentId: string,
    emoji: string,
    userId: number
  ) => void;
}

export function TaskCommentSection({
  taskId,
  comments,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onAddReply,
  onAddReaction,
}: TaskCommentSectionProps) {
  const [composer, setComposer] = React.useState("");
  const main = useMentionableTextarea({
    value: composer,
    onChange: setComposer,
    maxLength: MAX_COMMENT_LENGTH,
  });

  const [expandedThreads, setExpandedThreads] = React.useState<
    Record<string, boolean>
  >({});

  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>(
    {}
  );

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");

  const toggleThread = (commentId: string) => {
    setExpandedThreads((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }));
  };

  const submitMain = () => {
    const body = composer.trim();
    if (!body) return;
    onAddComment(taskId, body);
    setComposer("");
    main.closeMention();
  };

  const startEdit = (id: string, body: string) => {
    setEditingId(id);
    setEditDraft(body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = () => {
    if (!editingId) return;
    const body = editDraft.trim();
    if (!body) return;
    onEditComment(taskId, editingId, body);
    cancelEdit();
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Task comments">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MessageSquare className="size-4 text-muted-foreground" />
        Comments
      </div>

      <Popover
        open={main.mentionOpen}
        onOpenChange={(o) => {
          if (!o) main.closeMention();
        }}
      >
        <PopoverAnchor asChild>
          <div className="flex flex-col gap-2">
            <Textarea
              ref={main.ref}
              placeholder="Write a comment..."
              value={composer}
              onChange={main.onInternalChange}
              onSelect={main.onSelect}
              onKeyUp={main.onKeyUp}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submitMain();
                }
              }}
              className="min-h-24 resize-y"
              maxLength={MAX_COMMENT_LENGTH}
              aria-label="Comment composer"
            />
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-xs text-muted-foreground",
                  composer.length >= MAX_COMMENT_LENGTH && "text-destructive"
                )}
              >
                {composer.length}/{MAX_COMMENT_LENGTH}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={submitMain}
                disabled={!composer.trim()}
              >
                <Send className="size-3.5" data-icon="inline-start" />
                Comment
              </Button>
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-64 p-0"
          align="start"
          side="bottom"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-48 overflow-y-auto p-1">
            {main.filteredMembers.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No matching teammates
              </p>
            ) : (
              main.filteredMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => main.insertMention(m)}
                >
                  <Avatar size="sm">
                    <AvatarImage src={m.avatar_url} alt="" />
                    <AvatarFallback
                      className="text-[10px] text-white"
                      style={{ backgroundColor: m.avatarColor }}
                    >
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{m.name}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Separator />

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No comments yet. Start the thread above.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentThread
                taskId={taskId}
                comment={comment}
                expanded={!!expandedThreads[comment.id]}
                onToggleReplies={() => toggleThread(comment.id)}
                onExpandForReply={() =>
                  setExpandedThreads((prev) => ({
                    ...prev,
                    [comment.id]: true,
                  }))
                }
                replyBody={replyDrafts[comment.id] ?? ""}
                setReplyBody={(v) =>
                  setReplyDrafts((prev) => ({ ...prev, [comment.id]: v }))
                }
                onAddReply={onAddReply}
                onEditComment={onEditComment}
                onDeleteComment={onDeleteComment}
                onAddReaction={onAddReaction}
                editingId={editingId}
                editDraft={editDraft}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onSaveEdit={saveEdit}
                onEditDraftChange={setEditDraft}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentThread({
  taskId,
  comment,
  expanded,
  onToggleReplies,
  onExpandForReply,
  replyBody,
  setReplyBody,
  onAddReply,
  onEditComment,
  onDeleteComment,
  onAddReaction,
  editingId,
  editDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
}: {
  taskId: string;
  comment: Comment;
  expanded: boolean;
  onToggleReplies: () => void;
  onExpandForReply: () => void;
  replyBody: string;
  setReplyBody: (v: string) => void;
  onAddReply: TaskCommentSectionProps["onAddReply"];
  onEditComment: TaskCommentSectionProps["onEditComment"];
  onDeleteComment: TaskCommentSectionProps["onDeleteComment"];
  onAddReaction: TaskCommentSectionProps["onAddReaction"];
  editingId: string | null;
  editDraft: string;
  onStartEdit: (id: string, body: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditDraftChange: (v: string) => void;
}) {
  const author = getMember(comment.author_id);
  const isEditing = editingId === comment.id;
  const [reactionOpen, setReactionOpen] = React.useState(false);

  const submitReply = () => {
    const body = replyBody.trim();
    if (!body) return;
    const mentionIds = extractMentionIds(body);
    onAddReply(taskId, comment.id, body, mentionIds);
    setReplyBody("");
  };

  const replyTa = useMentionableTextarea({
    value: replyBody,
    onChange: setReplyBody,
    maxLength: MAX_COMMENT_LENGTH,
  });

  const toggleReaction = (emoji: string) => {
    onAddReaction(taskId, comment.id, emoji, CURRENT_USER_ID);
  };

  return (
    <div className="group/comment rounded-lg border border-border/60 bg-card/30 p-3 dark:bg-card/20">
      <div className="flex gap-3">
        <Avatar size="sm" className="mt-0.5">
          {author ? (
            <>
              <AvatarImage src={author.avatar_url} alt="" />
              <AvatarFallback
                className="text-[10px] text-white"
                style={{ backgroundColor: author.avatarColor }}
              >
                {author.initials}
              </AvatarFallback>
            </>
          ) : (
            <AvatarFallback>?</AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">
              {author?.name ?? "Unknown"}
            </span>
            <time
              className="text-xs text-muted-foreground"
              dateTime={comment.created_at}
            >
              {timeAgo(comment.created_at)}
            </time>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editDraft}
                onChange={(e) => onEditDraftChange(e.target.value)}
                className="min-h-20 text-sm"
                maxLength={MAX_COMMENT_LENGTH}
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={onSaveEdit}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onCancelEdit}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <CommentBodyHtml body={comment.body} />
          )}

          <div className="flex flex-wrap items-center gap-1 pt-1">
            {comment.reactions.map((r) => {
              const active = r.userIds.includes(CURRENT_USER_ID);
              return (
                <Button
                  key={r.emoji}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="xs"
                  className="h-7 gap-1 px-2 font-normal"
                  onClick={() => toggleReaction(r.emoji)}
                  aria-pressed={active}
                >
                  <span>{r.emoji}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {r.userIds.length}
                  </span>
                </Button>
              );
            })}
            <Popover open={reactionOpen} onOpenChange={setReactionOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Add reaction"
                >
                  <Smile className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <div className="grid grid-cols-4 gap-1">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="flex size-9 items-center justify-center rounded-md text-lg hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        toggleReaction(emoji);
                        setReactionOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {!isEditing && (
            <div className="flex flex-wrap items-center gap-2 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100">
              {comment.replies.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-7 text-muted-foreground"
                  onClick={onToggleReplies}
                >
                  {expanded
                    ? "Hide replies"
                    : `View ${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}`}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-7 text-muted-foreground"
                onClick={() => {
                  onExpandForReply();
                  setTimeout(() => replyTa.ref.current?.focus(), 0);
                }}
              >
                <ReplyIcon className="size-3" data-icon="inline-start" />
                Reply
              </Button>
              {comment.author_id === CURRENT_USER_ID && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-7 text-muted-foreground"
                    onClick={() => onStartEdit(comment.id, comment.body)}
                  >
                    <Pencil className="size-3" data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-7 text-destructive hover:text-destructive"
                    onClick={() => onDeleteComment(taskId, comment.id)}
                  >
                    <Trash2 className="size-3" data-icon="inline-start" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          )}

          {expanded && (
            <div className="mt-3 space-y-3 border-l-2 border-border pl-3">
              <ul className="flex flex-col gap-3">
                {comment.replies.map((reply) => (
                  <li key={reply.id}>
                    <ReplyBlock
                      taskId={taskId}
                      reply={reply}
                      onEditComment={onEditComment}
                      onDeleteComment={onDeleteComment}
                      editingId={editingId}
                      editDraft={editDraft}
                      onStartEdit={onStartEdit}
                      onCancelEdit={onCancelEdit}
                      onSaveEdit={onSaveEdit}
                      onEditDraftChange={onEditDraftChange}
                    />
                  </li>
                ))}
              </ul>
              <Popover
                open={replyTa.mentionOpen}
                onOpenChange={(o) => {
                  if (!o) replyTa.closeMention();
                }}
              >
                <PopoverAnchor asChild>
                  <div className="flex flex-col gap-2">
                    <Textarea
                      ref={replyTa.ref}
                      placeholder="Write a reply..."
                      value={replyBody}
                      onChange={replyTa.onInternalChange}
                      onSelect={replyTa.onSelect}
                      onKeyUp={replyTa.onKeyUp}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          submitReply();
                        }
                      }}
                      className="min-h-16 resize-y text-sm"
                      maxLength={MAX_COMMENT_LENGTH}
                      aria-label="Reply composer"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {replyBody.length}/{MAX_COMMENT_LENGTH}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={submitReply}
                        disabled={!replyBody.trim()}
                      >
                        <Send className="size-3.5" data-icon="inline-start" />
                        Reply
                      </Button>
                    </div>
                  </div>
                </PopoverAnchor>
                <PopoverContent
                  className="w-64 p-0"
                  align="start"
                  side="bottom"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="max-h-48 overflow-y-auto p-1">
                    {replyTa.filteredMembers.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        No matching teammates
                      </p>
                    ) : (
                      replyTa.filteredMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => replyTa.insertMention(m)}
                        >
                          <Avatar size="sm">
                            <AvatarImage src={m.avatar_url} alt="" />
                            <AvatarFallback
                              className="text-[10px] text-white"
                              style={{ backgroundColor: m.avatarColor }}
                            >
                              {m.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{m.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReplyBlock({
  taskId,
  reply,
  onEditComment,
  onDeleteComment,
  editingId,
  editDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
}: {
  taskId: string;
  reply: Reply;
  onEditComment: TaskCommentSectionProps["onEditComment"];
  onDeleteComment: TaskCommentSectionProps["onDeleteComment"];
  editingId: string | null;
  editDraft: string;
  onStartEdit: (id: string, body: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditDraftChange: (v: string) => void;
}) {
  const author = getMember(reply.author_id);
  const isEditing = editingId === reply.id;

  return (
    <div className="group/reply flex gap-2">
      <Avatar size="sm" className="mt-0.5">
        {author ? (
          <>
            <AvatarImage src={author.avatar_url} alt="" />
            <AvatarFallback
              className="text-[10px] text-white"
              style={{ backgroundColor: author.avatarColor }}
            >
              {author.initials}
            </AvatarFallback>
          </>
        ) : (
          <AvatarFallback>?</AvatarFallback>
        )}
      </Avatar>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{author?.name ?? "Unknown"}</span>
          <time
            className="text-xs text-muted-foreground"
            dateTime={reply.created_at}
          >
            {timeAgo(reply.created_at)}
          </time>
        </div>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              className="min-h-16 text-sm"
              maxLength={MAX_COMMENT_LENGTH}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={onSaveEdit}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCancelEdit}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <CommentBodyHtml body={reply.body} />
        )}
        {!isEditing && reply.author_id === CURRENT_USER_ID && (
          <div className="flex gap-2 opacity-0 transition-opacity group-hover/reply:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 text-muted-foreground"
              onClick={() => onStartEdit(reply.id, reply.body)}
            >
              <Pencil className="size-3" data-icon="inline-start" />
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 text-destructive hover:text-destructive"
              onClick={() => onDeleteComment(taskId, reply.id)}
            >
              <Trash2 className="size-3" data-icon="inline-start" />
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
