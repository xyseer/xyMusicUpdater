from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='searchsubscription',
            name='keyword_blacklist',
            field=models.TextField(blank=True, default='', help_text='Comma separated title keywords to skip'),
        ),
    ]
