from django.db import models
from django.utils import timezone

class DownloadJob(models.Model):
    JOB_TYPES = (
        ('manual', 'Manual'),
        ('cron', 'Cron'),
    )
    STATUS_CHOICES = (
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    )
    job_type = models.CharField(max_length=10, choices=JOB_TYPES)
    url = models.URLField(max_length=500, null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='queued')
    error = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.job_type} - {self.status} ({self.created_at})"

class Song(models.Model):
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('deleted', 'Deleted'),
        ('moved', 'Moved'),
    )
    filename = models.CharField(max_length=255, unique=True)
    filepath = models.CharField(max_length=500)
    title = models.CharField(max_length=255, null=True, blank=True)
    artist = models.CharField(max_length=255, null=True, blank=True)
    album = models.CharField(max_length=255, null=True, blank=True)
    album_artist = models.CharField(max_length=255, null=True, blank=True)
    source = models.CharField(max_length=100, null=True, blank=True)
    file_size = models.BigIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    needs_tagging = models.BooleanField(default=False)
    pending_confirmation = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    jobs = models.ManyToManyField(DownloadJob, related_name='songs_added')

    def __str__(self):
        return self.title or self.filename

class ActivityLog(models.Model):
    LEVEL_CHOICES = (
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('error', 'Error'),
    )
    job = models.ForeignKey(DownloadJob, on_delete=models.CASCADE, related_name='logs', null=True, blank=True)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='info')
    message = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']

class PermanentLog(models.Model):
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='permanent_logs')
    filename = models.CharField(max_length=255)
    reason = models.CharField(max_length=255)
    playlist = models.CharField(max_length=255, null=True, blank=True)
    moved_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.filename} - {self.reason}"

class SystemConfig(models.Model):
    key = models.CharField(max_length=50, unique=True)
    value = models.TextField()

    def __str__(self):
        return f"{self.key}: {self.value}"

class SearchSubscription(models.Model):
    label = models.CharField(max_length=100)
    keywords = models.TextField(help_text="Comma separated")
    source = models.CharField(max_length=50, default="youtube")
    amount = models.IntegerField(default=10)
    cycle_days = models.IntegerField(default=7)
    last_run = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.label
