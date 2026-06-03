// TasksSection — P3-05
//
// AI-curated prioritized task list anchoring the bottom of the noticeboard.
// Tasks are rendered in SQL ORDER BY priority ASC, created_at ASC (server-sorted,
// no client re-sort).
//
// Priority strips: border-l-4 {color} on the task item outer div.
//   priority === 1  -> border-l-red-500   (high)
//   priority === 2  -> border-l-amber-400 (medium)
//   else            -> border-l-border    (low)
//
// Complete toggle: optimistic swap IconCircle -> IconCircleCheck + opacity-50
// line-through before server round-trip. Rollback + toast on error.
//
// Proposal button: "Approve" Button variant="outline" only when task.proposalId
// is set. For V1 this scrolls/focuses the card — implemented as a lightweight
// informational button; the real AlertDialog gate lives on the BoardCard in Task 2.

"use client";

import { useState } from "react";
import { IconCircle, IconCircleCheck } from "@tabler/icons-react";
import { useActionMutation } from "@agent-native/core/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Task = {
  id: string;
  title: string;
  body?: string | null;
  priority: number;
  proposalId?: string | null;
};

type TasksSection = {
  tasks: Task[];
};

function priorityBorderClass(priority: number): string {
  if (priority === 1) return "border-l-red-500";
  if (priority === 2) return "border-l-amber-400";
  return "border-l-border";
}

type TaskRowProps = {
  task: Task;
};

function TaskRow({ task }: TaskRowProps) {
  const [optimisticCompleted, setOptimisticCompleted] = useState(false);

  const completeTask = useActionMutation("complete-task", {
    onMutate: () => {
      // Optimistic update: immediately show completed state
      setOptimisticCompleted(true);
    },
    onError: (_err) => {
      // Rollback
      setOptimisticCompleted(false);
      toast("Could not mark task as done. Please try again.");
    },
    // onSuccess: the server confirms; useDbSync polling will refresh the
    // tasks list which hides completed tasks (status='open' filter in loader).
  });

  const isCompleted = optimisticCompleted;

  return (
    <div
      className={`flex items-start gap-3 py-3 min-h-[44px] border-l-4 pl-3 ${priorityBorderClass(task.priority)} ${isCompleted ? "opacity-50" : ""}`}
    >
      {/* Complete toggle */}
      <button
        type="button"
        aria-label="Mark task complete"
        className="shrink-0 mt-0.5 cursor-pointer"
        onClick={() => {
          if (!isCompleted) {
            completeTask.mutate({ taskId: task.id } as Record<
              string,
              unknown
            > as Parameters<typeof completeTask.mutate>[0]);
          }
        }}
        disabled={isCompleted || completeTask.isPending}
      >
        {isCompleted ? (
          <IconCircleCheck size={16} className="text-green-600" />
        ) : (
          <IconCircle size={16} className="text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-semibold${isCompleted ? " line-through" : ""}`}
        >
          {task.title}
        </div>
        {task.body && (
          <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {task.body}
          </div>
        )}
      </div>

      {/* Per-task proposal approve — only when proposalId is set */}
      {task.proposalId && !isCompleted && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => {
            // V1: scroll to the relevant card's proposal zone where the
            // full AlertDialog gate lives. The BoardCard filters proposals
            // by actionName and renders the full Approve flow there.
            const cardEl = document.querySelector(
              `[data-proposal-id="${task.proposalId}"]`,
            );
            cardEl?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          Approve
        </Button>
      )}
    </div>
  );
}

export function TasksSection({ tasks }: TasksSection) {
  return (
    <div className="flex flex-col gap-2">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          TASKS
        </span>
        {tasks.length > 0 && <Badge variant="secondary">{tasks.length}</Badge>}
      </div>

      {/* Empty state */}
      {tasks.length === 0 ? (
        <div className="py-8 text-center">
          <div className="text-sm font-semibold text-muted-foreground">
            No tasks yet
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            The agent will create tasks here as it identifies recommendations.
            You can also create tasks by asking in the chat.
          </div>
        </div>
      ) : (
        <div>
          {tasks.map((task, index) => (
            <div key={task.id}>
              {index > 0 && <Separator />}
              <TaskRow task={task} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
